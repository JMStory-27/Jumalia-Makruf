'use strict';

/**
 * MTProto file downloader menggunakan gramjs.
 * Bisa download file Telegram hingga 2GB — jauh melewati batas 20MB Bot API.
 *
 * api_id  : 32971402
 * api_hash: 0858f6b41175797296f6b763b5b17e4e
 */

const { TelegramClient } = require('telegram');
const { StringSession }  = require('telegram/sessions');
const { Api }            = require('telegram');
const path               = require('path');
const fs                 = require('fs');

const API_ID   = 32971402;
const API_HASH = '0858f6b41175797296f6b763b5b17e4e';

// Session string disimpan ke file supaya tidak perlu re-auth setiap restart
const SESSION_PATH = path.join(__dirname, 'data', 'mtproto-session.txt');

function loadSession() {
  try { return fs.readFileSync(SESSION_PATH, 'utf8').trim(); } catch { return ''; }
}

function saveSession(str) {
  try {
    fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true });
    fs.writeFileSync(SESSION_PATH, str, 'utf8');
  } catch (e) { console.error('[mtproto] save session error:', e.message); }
}

let _client = null;

async function getClient() {
  if (_client && _client.connected) return _client;

  const session = new StringSession(loadSession());
  const client  = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
    useWSS: false,
  });

  // Login sebagai bot — tidak butuh interaksi user
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN tidak ditemukan');

  await client.start({ botAuthToken: botToken });

  // Simpan session string supaya tidak re-auth tiap restart
  const newSession = client.session.save();
  if (newSession) saveSession(newSession);

  _client = client;
  return client;
}

/**
 * Download file dari Telegram via MTProto.
 * @param {string|number} fileId  — file_id dari Telegram Bot API (bisa berupa string file_id)
 * @param {object} fileObj        — object video/document dari message (butuh file_size, dll)
 * @param {object} msgObj         — message object asli (untuk resolve media langsung)
 * @returns {Promise<Buffer>}
 */
async function downloadViaMTProto(msgObj) {
  const client = await getClient();

  // Ambil media dari message — ini cara paling reliable
  // msgObj.chat.id dan msgObj.message_id untuk resolve pesan
  const chatId  = msgObj.chat.id;
  const msgId   = msgObj.message_id;

  // Resolve peer
  let peer;
  try {
    peer = await client.getEntity(chatId);
  } catch {
    peer = new Api.PeerUser({ userId: BigInt(Math.abs(chatId)) });
  }

  // Ambil message via MTProto
  const messages = await client.invoke(
    new Api.messages.GetMessages({ id: [new Api.InputMessageID({ id: msgId })] })
  );

  const tgMsg = messages.messages?.[0];
  if (!tgMsg || !tgMsg.media) throw new Error('Pesan atau media tidak ditemukan via MTProto');

  // Download langsung dari media object — gramjs handles chunking otomatis
  const buffer = await client.downloadMedia(tgMsg.media, {
    progressCallback: (received, total) => {
      if (total > 0) {
        const pct = Math.round((Number(received) / Number(total)) * 100);
        process.stdout.write(`\r[mtproto] download ${pct}%`);
      }
    },
  });

  process.stdout.write('\n');
  return Buffer.from(buffer);
}

module.exports = { downloadViaMTProto, getClient };
