'use strict';

const sharp  = require('sharp');
const { checkWANumber } = require('../wa-checker');

function xmlEsc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Parse nomor ke full E.164 digits (e.g. "081234" → "6281234")
function parsePhone(raw) {
    const clean = String(raw).replace(/\D/g, '');
    if (!clean || clean.length < 6) return null;
    if (clean.startsWith('62'))  return clean;
    if (clean.startsWith('0'))   return '62' + clean.slice(1);
    if (clean.startsWith('8') && clean.length >= 8) return '62' + clean;
    return clean;  // international format kept as-is
}

// Map status → display config
function mapStatus(result) {
    switch (result.status) {
        case 'registered':
            return {
                type:    'registered',
                label:   'REGISTERED',
                sub:     'Aktif di WhatsApp',
                sms:     '✅ WA: OK',
                accent:  '#25d366',
                dot:     '#25d366',
                badge:   '#1a3d2b',
                icon:    '✅',
            };
        case 'registered_blocked':
            return {
                type:    'banned',
                label:   'BANNED',
                sub:     'Terdaftar, diblokir third-party',
                sms:     '🚫 BANNED',
                accent:  '#ff4444',
                dot:     '#ff4444',
                badge:   '#3d1e1e',
                icon:    '🚫',
            };
        case 'not_registered':
            return {
                type:    'sms_ok',
                label:   'SMS: OK',
                sub:     'Tidak di WA — SMS berhasil terkirim',
                sms:     '📱 SMS: OK',
                accent:  '#4dabf7',
                dot:     '#4dabf7',
                badge:   '#1e2d3d',
                icon:    '📱',
            };
        case 'cooldown':
            return {
                type:    'cooldown',
                label:   'COOLDOWN',
                sub:     result.waitSec ? `Tunggu ${Math.ceil(result.waitSec/60)} menit` : 'Coba lagi nanti',
                sms:     '⏳ COOLDOWN',
                accent:  '#ffa500',
                dot:     '#ffa500',
                badge:   '#3d2e1a',
                icon:    '⏳',
            };
        default:
            return {
                type:    'unknown',
                label:   'UNKNOWN',
                sub:     result.note || 'Status tidak diketahui',
                sms:     '❓ UNKNOWN',
                accent:  '#888888',
                dot:     '#888888',
                badge:   '#252530',
                icon:    '❓',
            };
    }
}

function buildCardSvg(number, cfg, result) {
    const numFmt    = xmlEsc(number.length > 4 && !number.startsWith('+') ? '+' + number : number);
    const labelText = xmlEsc(cfg.label);
    const subText   = xmlEsc(cfg.sub);
    const rawText   = xmlEsc(result.rawStatus || '');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220" viewBox="0 0 420 220" font-family="'Courier New',Courier,monospace">
  <!-- Background -->
  <rect width="420" height="220" rx="14" fill="#0d1117"/>
  <!-- Top accent bar -->
  <rect width="420" height="4" rx="2" fill="${cfg.accent}"/>
  <!-- Header -->
  <text x="22" y="36" font-size="10" fill="#444" letter-spacing="2.5">WA NUMBER CHECKER</text>
  <line x1="22" y1="46" x2="398" y2="46" stroke="#21262d" stroke-width="1"/>
  <!-- Number -->
  <circle cx="34" cy="78" r="5" fill="${cfg.dot}"/>
  <text x="50" y="84" font-size="17" font-weight="700" fill="#e6edf3">${numFmt}</text>
  <line x1="22" y1="100" x2="398" y2="100" stroke="#21262d" stroke-width="1" stroke-dasharray="4,3"/>
  <!-- Status label big -->
  <text x="22" y="132" font-size="22" font-weight="800" fill="${cfg.accent}" letter-spacing="1">${labelText}</text>
  <!-- Sub text -->
  <text x="22" y="156" font-size="12" fill="#8b949e">${subText}</text>
  <!-- Raw status badge -->
  <rect x="22" y="172" rx="5" ry="5" width="260" height="24" fill="${cfg.badge}" stroke="${cfg.accent}" stroke-width="1"/>
  <text x="152" y="189" font-size="10" fill="${cfg.accent}" text-anchor="middle" font-weight="600">${rawText}</text>
  <!-- Footer -->
  <text x="398" y="212" font-size="9" fill="#21262d" text-anchor="end">@Bot · WA API</text>
</svg>`;
}

async function generateCard(number, cfg, result) {
    const svg = buildCardSvg(number, cfg, result);
    return sharp(Buffer.from(svg)).png().toBuffer();
}

async function registerCekCommand(bot) {
    bot.onText(/^\/cek(?:\s+([\s\S]+))?$/i, async (msg) => {
        const chatId = msg.chat.id;
        const raw    = msg.text.replace(/^\/cek\s*/i, '').trim();

        if (!raw) {
            return bot.sendMessage(chatId,
                `📱 *WA Number Checker — /cek*\n\n` +
                `Periksa status nomor di WhatsApp:\n\n` +
                `• Satu nomor: \`/cek 6281234567890\`\n` +
                `• Banyak nomor: \`/cek 62812xxx 62813xxx\`\n` +
                `• Format lain: \`/cek 081234567890\`\n\n` +
                `*Hasil:*\n` +
                `✅ \`REGISTERED\` — Aktif di WA\n` +
                `📱 \`SMS: OK\` — Tidak di WA, SMS terkirim\n` +
                `🚫 \`BANNED\` — Terdaftar tapi diblokir\n` +
                `⏳ \`COOLDOWN\` — Rate limited, coba lagi\n` +
                `❓ \`UNKNOWN\` — Status tidak diketahui`,
                { parse_mode: 'Markdown' }
            );
        }

        const tokens = raw.split(/[\s,\n]+/).map(t => t.trim()).filter(Boolean);
        const phones = [...new Set(tokens.map(parsePhone).filter(Boolean))];

        if (phones.length === 0) {
            return bot.sendMessage(chatId,
                '❌ Format nomor tidak valid.\nContoh: `/cek 6281234567890`',
                { parse_mode: 'Markdown' }
            );
        }

        if (phones.length > 8) {
            return bot.sendMessage(chatId, '⚠️ Maksimal 8 nomor sekaligus.');
        }

        const statusMsg = await bot.sendMessage(chatId, `🔍 Mengecek ${phones.length} nomor via WA API…`);

        const errors = [];
        for (const phone of phones) {
            try {
                const result = await checkWANumber(phone);
                const cfg    = mapStatus(result);
                const img    = await generateCard(phone, cfg, result);

                await bot.sendPhoto(chatId, img, {
                    caption:    `${cfg.icon} \`+${phone}\` — *${cfg.label}*\n${cfg.sub}`,
                    parse_mode: 'Markdown',
                    filename:   `cek_${phone}.png`,
                });
            } catch (e) {
                errors.push(`${phone}: ${e.message}`);
            }
        }

        if (errors.length) {
            await bot.sendMessage(chatId,
                `⚠️ Error pada ${errors.length} nomor:\n` + errors.map(e => `• ${e}`).join('\n')
            );
        }

        bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    });

    console.log('✅ /cek command registered — WA encrypted API (no session needed)');
}

module.exports = { registerCekCommand };
