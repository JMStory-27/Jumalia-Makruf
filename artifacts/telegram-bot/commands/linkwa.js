'use strict';

const { isSessionConnected, requestPairingCode } = require('./wa-session');

function parsePhone(raw) {
    const clean = String(raw).replace(/\D/g, '');
    if (!clean || clean.length < 8) return null;
    if (clean.startsWith('62')) return clean;
    if (clean.startsWith('0')) return '62' + clean.slice(1);
    if (clean.startsWith('8')) return '62' + clean;
    return clean;
}

async function registerLinkWACommand(bot, ownerChatId) {
    bot.onText(/^\/linkwa(?:\s+(.+))?$/i, async (msg) => {
        const chatId = msg.chat.id;

        // Only allow owner
        if (String(chatId) !== String(ownerChatId)) {
            return bot.sendMessage(chatId, '❌ Perintah ini hanya untuk owner bot.');
        }

        if (isSessionConnected()) {
            return bot.sendMessage(chatId,
                '✅ *WA Session sudah terhubung!*\n\n' +
                'Bot sudah bisa terima perintah /cek.\n' +
                '_Untuk disconnect, hapus folder `data/wa-session/` dan restart bot._',
                { parse_mode: 'Markdown' }
            );
        }

        const rawPhone = msg.text.replace(/^\/linkwa\s*/i, '').trim();
        if (!rawPhone) {
            return bot.sendMessage(chatId,
                '📱 *Link WA Session*\n\n' +
                'Kirim nomor WA kamu untuk mendapat kode pairing:\n' +
                '`/linkwa 6281234567890`\n\n' +
                '_Nomor ini akan digunakan sebagai "akun WA" untuk bot._',
                { parse_mode: 'Markdown' }
            );
        }

        const phone = parsePhone(rawPhone);
        if (!phone) {
            return bot.sendMessage(chatId, '❌ Format nomor tidak valid.\nContoh: `/linkwa 6281234567890`', { parse_mode: 'Markdown' });
        }

        try {
            await bot.sendMessage(chatId, `⏳ Meminta kode pairing untuk *+${phone}*...`, { parse_mode: 'Markdown' });

            const code = await requestPairingCode(phone);
            const formatted = code.match(/.{1,4}/g)?.join('-') || code;

            await bot.sendMessage(chatId,
                `🔑 *Kode Pairing WA:*\n\n` +
                `\`${formatted}\`\n\n` +
                `*Cara pakai:*\n` +
                `1. Buka WhatsApp di HP kamu\n` +
                `2. Ketuk ⋮ → Perangkat Tertaut\n` +
                `3. Ketuk "Tautkan perangkat"\n` +
                `4. Pilih "Tautkan dengan nomor telepon"\n` +
                `5. Masukkan kode di atas\n\n` +
                `⏰ Kode berlaku ±60 detik`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            await bot.sendMessage(chatId,
                `❌ *Gagal minta pairing code:*\n${e.message}\n\n` +
                `Pastikan WA session sudah diinisialisasi dengan /start dulu.`,
                { parse_mode: 'Markdown' }
            );
        }
    });

    console.log('✅ /linkwa command registered — WA session pairing');
}

module.exports = { registerLinkWACommand };
