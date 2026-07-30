'use strict';

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore,
    isJidUser,
} = require('@whiskeysockets/baileys');
const path = require('path');
const pino = require('pino');

const SESSION_DIR = path.join(__dirname, '../data/wa-session');

let sock = null;
let isConnected = false;
let connectResolvers = [];

const logger = pino({ level: 'silent' });

async function getSocket() {
    if (sock && isConnected) return sock;
    return new Promise((resolve) => connectResolvers.push(resolve));
}

async function startWASession(bot, ownerChatId) {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['Chrome (Linux)', 'Chrome', '124.0.6367.60'],
        connectTimeoutMs: 30000,
        retryRequestDelayMs: 500,
        maxMsgRetryCount: 3,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (connection === 'open') {
            isConnected = true;
            console.log('✅ WA Session connected!');
            const resolvers = [...connectResolvers];
            connectResolvers = [];
            resolvers.forEach(r => r(sock));

            if (ownerChatId && bot) {
                bot.sendMessage(ownerChatId, '✅ *WA Session terhubung!*\nSekarang `/cek` sudah bisa digunakan.', { parse_mode: 'Markdown' }).catch(() => {});
            }
        }

        if (connection === 'close') {
            isConnected = false;
            const code = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = code !== DisconnectReason.loggedOut;
            console.log(`WA Session closed (code: ${code}), reconnect: ${shouldReconnect}`);

            if (shouldReconnect) {
                setTimeout(() => startWASession(bot, null), 5000);
            } else {
                console.log('WA Session logged out — need to re-link');
                if (ownerChatId && bot) {
                    bot.sendMessage(ownerChatId, '⚠️ WA Session logout. Gunakan /linkwa untuk hubungkan ulang.').catch(() => {});
                }
            }
        }
    });

    return sock;
}

// Check if number(s) are registered on WhatsApp
// Returns array of { number, full, exists, isBusiness }
async function checkNumbers(phones) {
    const socket = await Promise.race([
        getSocket(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('WA session timeout — belum terhubung')), 15000)),
    ]);

    const results = [];
    for (const { cc, num, full } of phones) {
        try {
            const jid = full + '@s.whatsapp.net';
            const [result] = await socket.onWhatsApp(jid);
            results.push({
                full,
                exists: result?.exists === true,
                isBusiness: result?.isBusiness === true,
            });
        } catch (e) {
            results.push({ full, exists: null, error: e.message });
        }
        // Small delay to be gentle on WA
        if (phones.length > 1) await new Promise(r => setTimeout(r, 600));
    }
    return results;
}

function isSessionConnected() {
    return isConnected;
}

// Request pairing code (number-based, no QR needed)
async function requestPairingCode(phoneNumber) {
    if (!sock) throw new Error('Session belum diinisialisasi');
    // phoneNumber format: 628xxx (no +)
    const code = await sock.requestPairingCode(phoneNumber);
    return code;
}

module.exports = { startWASession, checkNumbers, isSessionConnected, requestPairingCode, getSocket };
