import 'dotenv/config';
import pino from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';

const logger = pino({ level: 'silent' });

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    version,
    logger,
    browser: ['Hell2Bot', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection }) => {
    if (connection === 'open') {
      console.log('Conectado! Buscando grupos...\n');
      try {
        const groups = await sock.groupFetchAllParticipating();
        for (const [jid, meta] of Object.entries(groups)) {
          console.log(`${meta.subject}  →  ${jid}`);
        }
      } catch (err) {
        console.error('Erro ao listar grupos:', err.message);
      }
      console.log('\nDone.');
      process.exit(0);
    }
  });
}

main().catch(console.error);
