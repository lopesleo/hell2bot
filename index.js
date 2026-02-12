import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import pino from 'pino';
import express from 'express';

import * as db from './src/db.js';
import * as wa from './src/wa.js';
import * as detector from './src/detector.js';
import * as strategems from './src/strategems.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Logger ──────────────────────────────────────────
const logger = pino({
  level: process.env.DEBUG === 'true' ? 'debug' : 'info',
  transport: {
    targets: [
      { target: 'pino-pretty', level: 'info', options: { colorize: true } },
      { target: 'pino/file', level: 'info', options: { destination: path.join(__dirname, 'bot.log'), mkdir: true } },
    ],
  },
});

// ── Config validation ───────────────────────────────
const GROUP_JID = process.env.GROUP_JID;
const ADMIN_PHONES = (process.env.ADMIN_PHONES || '').split(',').filter(Boolean);
const POLL_CRON = process.env.POLL_CRON || '*/5 * * * *';
const PORT = parseInt(process.env.PORT || '3000', 10);

if (!GROUP_JID || !GROUP_JID.endsWith('@g.us')) {
  logger.error('GROUP_JID is required and must end with @g.us');
  process.exit(1);
}

// ── Database ────────────────────────────────────────
const dbPath = path.resolve(process.env.DB_PATH || './data/bot.sqlite');
db.init(dbPath);
logger.info({ dbPath }, 'Database initialized');

// ── Poll logic ──────────────────────────────────────
let polling = false;

async function runPoll() {
  if (polling) { logger.debug('Poll already running, skipping'); return; }
  polling = true;
  try {
    logger.info('Poll cycle start');
    const events = await detector.poll(logger);
    for (const ev of events) {
      logger.info({ type: ev.type }, 'Event detected');
      try {
        await wa.sendToGroup(GROUP_JID, ev.message);
      } catch (err) {
        logger.error(err, 'Failed to send event to group');
      }
    }
    logger.info(`Poll cycle done, ${events.length} event(s)`);
  } catch (err) {
    logger.error(err, 'Poll cycle failed');
  } finally {
    polling = false;
  }
}

// ── Message handler (commands) ──────────────────────
function setupMessageHandler(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;

      const chatJid = msg.key.remoteJid;
      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      ).trim();

      if (!text.startsWith('/')) continue;

      const cmd = text.split(' ')[0].toLowerCase();
      const senderRaw = msg.key.participant || msg.key.remoteJid || '';
      const senderPhone = senderRaw.replace(/@.*/, '');

      // /listgroups - admin only, works anywhere
      if (cmd === '/listgroups') {
        if (!ADMIN_PHONES.includes(senderPhone)) {
          logger.warn({ senderPhone }, 'Unauthorized /listgroups attempt');
          continue;
        }
        try {
          const groups = await wa.listGroups();
          const lines = groups.map((g) => `${g.subject}: ${g.jid}`);
          const reply = `*Grupos (${groups.length}):*\n\n${lines.join('\n')}`;
          await sock.sendMessage(chatJid, { text: reply });
        } catch (err) {
          logger.error(err, '/listgroups failed');
          await sock.sendMessage(chatJid, { text: '⚠️ Erro ao listar grupos.' });
        }
        continue;
      }

      // Commands below only work in the configured group
      if (chatJid !== GROUP_JID) continue;

      try {
        switch (cmd) {
          case '/help': {
            const helpText = detector.buildHelp();
            await sock.sendMessage(GROUP_JID, { text: helpText });
            break;
          }

          case '/status': {
            const statusText = await detector.buildStatus(logger);
            await sock.sendMessage(GROUP_JID, { text: statusText });
            break;
          }

          case '/order': {
            const orderText = await detector.buildOrderDetail(logger);
            await sock.sendMessage(GROUP_JID, { text: orderText });
            break;
          }

          case '/planets': {
            const planetsText = await detector.buildPlanets(logger);
            await sock.sendMessage(GROUP_JID, { text: planetsText });
            break;
          }

          case '/top': {
            const topText = await detector.buildTop(logger);
            await sock.sendMessage(GROUP_JID, { text: topText });
            break;
          }

          case '/eta': {
            const etaText = await detector.buildETA(logger);
            await sock.sendMessage(GROUP_JID, { text: etaText });
            break;
          }

          case '/meta': {
            const metaArgs = text.split(/\s+/).slice(1);
            const metaText = await strategems.buildMeta(metaArgs, logger);
            await sock.sendMessage(GROUP_JID, { text: metaText });
            break;
          }

          case '/tendencia': {
            const tendText = await strategems.buildTendencia(logger);
            await sock.sendMessage(GROUP_JID, { text: tendText });
            break;
          }

          case '/armas': {
            const armasArgs = text.split(/\s+/).slice(1);
            const armasText = await strategems.buildArmas(armasArgs, logger);
            await sock.sendMessage(GROUP_JID, { text: armasText });
            break;
          }

          case '/armors': {
            const armorArgs = text.split(/\s+/).slice(1);
            const armorText = await strategems.buildArmors(armorArgs, logger);
            await sock.sendMessage(GROUP_JID, { text: armorText });
            break;
          }

          case '/pollnow': {
            await sock.sendMessage(GROUP_JID, { text: '🔄 Executando poll...' });
            await runPoll();
            await sock.sendMessage(GROUP_JID, { text: '✅ Poll concluído.' });
            break;
          }

          default:
            // Unknown command — ignore silently
            break;
        }
      } catch (err) {
        logger.error(err, `Command ${cmd} failed`);
        await sock.sendMessage(GROUP_JID, { text: `⚠️ Erro ao executar ${cmd}.` });
      }
    }
  });
}

// ── Daily summary cron ──────────────────────────────
function scheduleDailySummary() {
  // 08:00 BRT (UTC-3 = 11:00 UTC)
  cron.schedule('0 11 * * *', async () => {
    logger.info('Daily summary (08:00 BRT)');
    try {
      const summary = await detector.buildDailySummary(logger);
      await wa.sendToGroup(GROUP_JID, summary);
    } catch (err) {
      logger.error(err, 'Daily summary 08:00 failed');
    }
  });

  // 20:00 BRT (UTC-3 = 23:00 UTC)
  cron.schedule('0 23 * * *', async () => {
    logger.info('Daily summary (20:00 BRT)');
    try {
      const summary = await detector.buildDailySummary(logger);
      await wa.sendToGroup(GROUP_JID, summary);
    } catch (err) {
      logger.error(err, 'Daily summary 20:00 failed');
    }
  });

  logger.info('Daily summaries scheduled: 08:00 and 20:00 BRT');

  // Weekly meta summary — Sunday 20:00 BRT (23:00 UTC)
  cron.schedule('0 23 * * 0', async () => {
    logger.info('Weekly stratagem summary (Sunday 20:00 BRT)');
    try {
      const summary = await strategems.buildWeeklySummary(logger);
      await wa.sendToGroup(GROUP_JID, summary);
    } catch (err) {
      logger.error(err, 'Weekly stratagem summary failed');
    }
  });
  logger.info('Weekly stratagem summary scheduled: Sunday 20:00 BRT');
}

// ── Express debug server ────────────────────────────
function startHTTP() {
  const app = express();
  app.get('/status', (_req, res) => {
    try {
      const snapshot = detector.getStateSnapshot();
      res.json({ ok: true, uptime: process.uptime(), ...snapshot });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
  const server = app.listen(PORT, () => logger.info({ port: PORT }, 'HTTP debug server listening'));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn({ port: PORT }, 'Port in use, HTTP debug server disabled');
    } else {
      logger.error(err, 'HTTP server error');
    }
  });
}

// ── Main ────────────────────────────────────────────
async function main() {
  logger.info('Hell2Bot starting...');

  const sock = await wa.connect(logger);
  logger.info('WhatsApp ready');

  setupMessageHandler(sock);

  // Only send "online" message if bot was offline for >5 min (avoid spam on restarts)
  const lastOnline = parseInt(db.getState('last_online_ts') || '0', 10);
  const now = Date.now();
  if (now - lastOnline > 5 * 60 * 1000) {
    try {
      await wa.sendToGroup(GROUP_JID, '🤖 *Hell2Bot online!*\nUse /help para ver os comandos.');
      logger.info('Sent online message to group');
    } catch (err) {
      logger.error(err, 'Failed to send online message');
    }
  }
  db.setState('last_online_ts', String(now));

  await runPoll();

  cron.schedule(POLL_CRON, () => {
    runPoll().catch((err) => logger.error(err, 'Cron poll failed'));
  });
  logger.info({ cron: POLL_CRON }, 'Cron scheduled');

  scheduleDailySummary();
  startHTTP();
}

main().catch((err) => {
  logger.fatal(err, 'Fatal startup error');
  process.exit(1);
});
