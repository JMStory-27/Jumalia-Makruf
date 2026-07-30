'use strict';

const fs = require('fs');
const path = require('path');

const GH_API = 'https://api.github.com';
const NOTIF_FILE = 'lawnime-notifications.json';

async function ghFetch(token, method, urlPath, body) {
    const res = await fetch(GH_API + urlPath, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'User-Agent': 'LawnimeBot',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { _raw: text }; }
}

async function pushNotification(token, owner, repo, notif) {
    const existing = await ghFetch(token, 'GET', `/repos/${owner}/${repo}/contents/${NOTIF_FILE}`);
    const notifications = [];

    if (existing.content) {
        try {
            const decoded = Buffer.from(existing.content, 'base64').toString('utf8');
            notifications.push(...JSON.parse(decoded));
        } catch {}
    }

    notifications.unshift(notif);
    const content = Buffer.from(JSON.stringify(notifications.slice(0, 50), null, 2)).toString('base64');

    const body = {
        message: `chore: push notifikasi admin - ${notif.title}`,
        content,
        ...(existing.sha ? { sha: existing.sha } : {}),
    };

    await ghFetch(token, 'PUT', `/repos/${owner}/${repo}/contents/${NOTIF_FILE}`, body);
}

function registerChatLawnimeCommand(bot) {
    const OWNER_ID = process.env.OWNER_TELEGRAM_ID ? String(process.env.OWNER_TELEGRAM_ID).trim() : null;
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER || 'JMStory-27';
    const repo = process.env.GITHUB_REPO || 'Jumalia-Makruf';

    const waitingForMessage = new Map();

    bot.onText(/^\/chatlawnime(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        const userId = String(msg.from?.id || '');

        if (OWNER_ID && userId !== OWNER_ID) {
            return bot.sendMessage(chatId, '❌ Command ini hanya untuk owner.');
        }

        waitingForMessage.set(chatId, true);
        await bot.sendMessage(chatId,
            `📢 *Kirim Notifikasi ke Lawnime*\n\nBalas pesan ini dengan format:\n\`Judul Notif | Isi pesan\`\n\nContoh:\n\`Episode Baru! | One Piece ep 1163 sudah tersedia!\`\n\nAtau ketik langsung pesannya saja (judul otomatis "Pesan dari Owner"):`,
            { parse_mode: 'Markdown' }
        );
    });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const userId = String(msg.from?.id || '');

        if (!waitingForMessage.get(chatId)) return;
        if (!msg.text || msg.text.startsWith('/')) return;
        if (OWNER_ID && userId !== OWNER_ID) return;

        waitingForMessage.delete(chatId);

        if (!token) {
            return bot.sendMessage(chatId, '❌ GITHUB_TOKEN tidak tersedia.');
        }

        let title = '📢 Pesan dari Owner';
        let body = msg.text.trim();

        if (body.includes('|')) {
            const [t, ...rest] = body.split('|');
            title = t.trim();
            body = rest.join('|').trim();
        }

        const notif = {
            id: `admin_${Date.now()}`,
            type: 'admin',
            title,
            body,
            timestamp: Date.now(),
            read: false,
            adminBadge: true,
        };

        try {
            await bot.sendMessage(chatId, '⏳ Mengirim notifikasi ke Lawnime...');

            // 1. Push to GitHub (in-app bell notification)
            await pushNotification(token, owner, repo, notif);

            // 2. Send Web Push to all subscribed devices (system notification bar)
            let webPushResult = null;
            try {
                const apiBase = process.env.REPLIT_DEV_DOMAIN
                    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
                    : 'http://localhost:80';
                const pushRes = await fetch(`${apiBase}/api/push/send`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, body, icon: '/anisub/icon-192.png', tag: notif.id }),
                });
                webPushResult = await pushRes.json();
            } catch (webPushErr) {
                console.error('[chatlawnime] web-push failed:', webPushErr.message);
            }

            const pushInfo = webPushResult
                ? `\n📲 Web Push: terkirim ke *${webPushResult.sent}* device`
                : '';

            await bot.sendMessage(chatId,
                `✅ *Notifikasi berhasil dikirim!*\n\n👑 *${title}*\n📝 ${body}\n\n⚡ Muncul di bell web dalam ~5 detik.${pushInfo}`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.error('[chatlawnime]', e.message);
            await bot.sendMessage(chatId, `❌ Gagal push ke GitHub: ${e.message}`);
        }
    });

    console.log('✅ /chatlawnime command registered');
}

module.exports = { registerChatLawnimeCommand };
