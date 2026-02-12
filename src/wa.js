import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

let sock = null;
let _parentLogger = null;

export async function connect(parentLogger) {
  _parentLogger = parentLogger;
  const logger = parentLogger.child({ module: 'wa' });
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    version,
    logger,
    browser: ['Hell2Bot', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    let resolved = false;

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Handle QR code manually (printQRInTerminal is deprecated in v6)
      if (qr) {
        console.log('\n📱 Escaneie o QR Code abaixo com o WhatsApp:\n');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        logger.warn({ code, shouldReconnect }, 'Connection closed');

        if (shouldReconnect) {
          setTimeout(() => {
            connect(_parentLogger).then(resolve).catch(reject);
          }, 5000);
        } else {
          logger.error('Logged out. Delete auth_info_baileys and scan QR again.');
          if (!resolved) { resolved = true; reject(new Error('Logged out')); }
        }
      }

      if (connection === 'open') {
        logger.info('WhatsApp connected!');
        if (!resolved) { resolved = true; resolve(sock); }
      }
    });
  });
}

export function getSock() {
  return sock;
}

export async function sendToGroup(groupJid, text) {
  if (!sock) throw new Error('WhatsApp not connected');
  await sock.sendMessage(groupJid, { text });
}

export async function listGroups() {
  if (!sock) throw new Error('WhatsApp not connected');
  const groups = await sock.groupFetchAllParticipating();
  const list = [];
  for (const [jid, meta] of Object.entries(groups)) {
    list.push({ jid, subject: meta.subject });
  }
  return list;
}
