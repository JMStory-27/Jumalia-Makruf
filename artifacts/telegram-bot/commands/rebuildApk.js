'use strict';

const fs   = require('fs');
const path = require('path');
const { buildApk }      = require('./localApkBuild');
const { PATCH_APK1, patchApk2Html } = require('./caturApkBuild');

const PUBLIC_DIR    = path.join(__dirname, '..', 'public');
const HTML_BIASA    = path.join(PUBLIC_DIR, 'catur.html');
const HTML_OWNER    = path.join(PUBLIC_DIR, 'caturadmin.html');
const ICON_PATH     = path.join(PUBLIC_DIR, 'chess-icon.png');

// ─── GitHub push helper ───────────────────────────────────────────────────────
async function ghPush(filePath, contentBuf, commitMsg) {
  const token = process.env.GITHUB_TOKEN;
  const owner = 'JMStory-27';
  const repo  = 'Jumalia-Makruf';
  const url   = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const b64   = contentBuf.toString('base64');
  const hdrs  = {
    'Authorization':        `Bearer ${token}`,
    'Accept':               'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':         'application/json',
    'User-Agent':           'AlbumAbadiBot',
  };
  const get  = await fetch(url, { headers: hdrs });
  const body = { message: commitMsg + ' [skip ci]', content: b64, branch: 'main' };
  if (get.ok) { const d = await get.json(); if (d.sha) body.sha = d.sha; }
  const put  = await fetch(url, { method: 'PUT', headers: hdrs, body: JSON.stringify(body) });
  if (!put.ok) {
    const t = await put.text();
    throw new Error(`GitHub push gagal ${put.status}: ${JSON.parse(t)?.message || t.slice(0,100)}`);
  }
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function bar(pct, w = 14) {
  const f = Math.round(pct / 100 * w);
  return '█'.repeat(f) + '░'.repeat(w - f);
}

// ─── Build one APK ────────────────────────────────────────────────────────────
async function buildOne(bot, chatId, type) {
  const isBiasa = type === 'biasa';

  // Check files
  const htmlSrc = isBiasa ? HTML_BIASA : HTML_OWNER;
  if (!fs.existsSync(htmlSrc)) {
    await bot.sendMessage(chatId,
      isBiasa
        ? '❌ File catur.html tidak ditemukan di server.'
        : '❌ File caturadmin.html belum dibuat.\n\nGunakan /buildcatur dulu untuk generate caturadmin.html, atau /adminweb untuk update file adminnya.'
    );
    return;
  }
  if (!fs.existsSync(ICON_PATH)) {
    await bot.sendMessage(chatId, '❌ File ikon chess-icon.png tidak ditemukan.');
    return;
  }

  const appName = isBiasa ? 'Catur BY Lawrenz' : 'Chess Royale Owner';
  const appId   = isBiasa ? 'com.lawrenz.caturbylawrenz' : 'com.lawrenz.chessroyaleowner';
  const ghPath  = isBiasa ? 'web/chess-master/CaturBYLawrenz.apk' : 'web/chess-master/ChessRoyaleOwner.apk';

  const htmlBuf = fs.readFileSync(htmlSrc);
  const iconBuf = fs.readFileSync(ICON_PATH);

  const htmlKB  = (htmlBuf.length / 1024).toFixed(0);
  const srcName = isBiasa ? 'catur.html' : 'caturadmin.html';

  const startTime = Date.now();
  const statusMsg = await bot.sendMessage(chatId,
    `🔨 Build ${appName}\n[${bar(0)}] 0%\nSumber: ${srcName} (${htmlKB} KB)\nMemulai...`
  );

  let lastEdit = 0;
  async function onProgress(step) {
    const now = Date.now();
    if (now - lastEdit < 2500) return;
    lastEdit = now;
    const elapsed = Math.floor((now - startTime) / 1000);
    const pctMap = { mempersiapkan:5, download:18, kompilasi:32, link:50, dex:65, pack:80, sign:93 };
    let pct = 5;
    const sl = step.toLowerCase();
    Object.keys(pctMap).forEach(k => { if (sl.includes(k)) pct = pctMap[k]; });
    try {
      await bot.editMessageText(
        `🔨 Build ${appName}\n[${bar(pct)}] ${pct}%\n${step.slice(0, 80)}\n⏱ ${elapsed}s`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
    } catch {}
  }

  try {
    // Patch HTML:
    // - APK Biasa: catur.html + inject PATCH_APK1
    // - APK Owner: caturadmin.html sudah punya semua patch, langsung pakai as-is
    let finalHtml;
    if (isBiasa) {
      let str = htmlBuf.toString('utf8');
      str = str.includes('</head>')
        ? str.replace('</head>', PATCH_APK1 + '\n</head>')
        : PATCH_APK1 + '\n' + str;
      finalHtml = Buffer.from(str, 'utf8');
    } else {
      // caturadmin.html sudah sepenuhnya siap, langsung build
      finalHtml = htmlBuf;
    }

    const apkBuf = await buildApk(finalHtml, onProgress, { appName, appId, cn: appName, iconBuf });
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const sizeMB  = (apkBuf.length / 1024 / 1024).toFixed(2);

    await bot.editMessageText(
      `✅ Build selesai!\n[${bar(100)}] 100%\n⏱ ${elapsed}s | 📦 ${sizeMB} MB\nMengirim APK...`,
      { chat_id: chatId, message_id: statusMsg.message_id }
    ).catch(() => {});

    const label = isBiasa
      ? '✅ APK User Biasa — Hint/Undo tersembunyi saat Online & Matchmaking'
      : '👑 APK Eksklusif Owner — Tombol KHUSUS OWNER di menu, panel admin full + Firebase';

    await bot.sendDocument(
      chatId,
      apkBuf,
      { caption:
          `📱 *${appName}*\n\n${label}\n\n` +
          `📦 ${sizeMB} MB | Android 5.0+ | Signed RSA 2048\n` +
          `⏱ Build: ${elapsed}s\n` +
          `📄 Sumber: ${srcName}\n\n` +
          `📲 Cara Install: tap file APK di HP → Install\n` +
          `_(Aktifkan "Sumber Tidak Dikenal" jika diminta)_`,
        parse_mode: 'Markdown'
      },
      { filename: appName.replace(/\s+/g, '') + '.apk', contentType: 'application/vnd.android.package-archive' }
    );

    // Push to GitHub in background
    ghPush(ghPath, apkBuf, `Rebuild ${appName}`)
      .then(url => {
        bot.sendMessage(chatId,
          `🔗 *Link Download ${appName}:*\n\`${url}\``,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      })
      .catch(e => {
        bot.sendMessage(chatId, `⚠️ APK terkirim via chat, gagal push GitHub: ${e.message.slice(0, 150)}`).catch(() => {});
      });

  } catch (e) {
    console.error(`[rebuildApk ${appName}] ERROR:`, e.message);
    await bot.editMessageText(
      `❌ Build Gagal: ${appName}\n\n${e.message.slice(0, 400)}`,
      { chat_id: chatId, message_id: statusMsg.message_id }
    ).catch(() => bot.sendMessage(chatId, `❌ Build gagal: ${e.message.slice(0, 300)}`).catch(() => {}));
  }
}

// ─── Register /rebuildapk ─────────────────────────────────────────────────────
function registerRebuildApk(bot) {
  // Map: chatId → pending callback (to avoid stale clicks)
  const pending = new Map();

  bot.onText(/^\/rebuildapk(?:\s|$)/i, async (msg) => {
    const chatId = msg.chat.id;

    // File status check
    const hasBiasa = fs.existsSync(HTML_BIASA);
    const hasOwner = fs.existsSync(HTML_OWNER);
    const biasaKB  = hasBiasa ? (fs.statSync(HTML_BIASA).size / 1024).toFixed(0) + ' KB' : '❌ tidak ada';
    const ownerKB  = hasOwner ? (fs.statSync(HTML_OWNER).size / 1024).toFixed(0) + ' KB' : '❌ belum dibuat';

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: `🎮 Catur Biasa  (${biasaKB})`,
            callback_data: `rebuildapk:biasa:${chatId}`
          }
        ],
        [
          {
            text: `👑 Catur Owner  (${ownerKB})`,
            callback_data: `rebuildapk:owner:${chatId}`
          }
        ],
        [
          {
            text: '⚡ Keduanya Sekaligus',
            callback_data: `rebuildapk:both:${chatId}`
          }
        ]
      ]
    };

    const infoMsg = await bot.sendMessage(chatId,
      `📱 *Rebuild APK Chess*\n\n` +
      `Pilih APK mana yang mau di-build ulang:\n\n` +
      `🎮 *Catur Biasa* — sumber: \`catur.html\`\n` +
      `${hasBiasa ? '✅' : '❌'} File: ${biasaKB}\n\n` +
      `👑 *Catur Owner* — sumber: \`caturadmin.html\`\n` +
      `${hasOwner ? '✅' : '❌'} File: ${ownerKB}\n\n` +
      `_Klik tombol di bawah untuk mulai build:_`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );

    pending.set(chatId, infoMsg.message_id);
  });

  // Handle inline button callbacks
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('rebuildapk:')) return;

    const [, type, origChatId] = data.split(':');
    const chatId = query.message.chat.id;

    // Answer callback to remove loading spinner
    await bot.answerCallbackQuery(query.id, {
      text: type === 'both'
        ? '⚡ Build keduanya dimulai!'
        : `🔨 Build ${type === 'biasa' ? 'Catur Biasa' : 'Catur Owner'} dimulai!`
    }).catch(() => {});

    // Disable buttons after click
    try {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: query.message.message_id }
      );
    } catch {}

    // Run build(s)
    if (type === 'biasa') {
      await buildOne(bot, chatId, 'biasa');
    } else if (type === 'owner') {
      await buildOne(bot, chatId, 'owner');
    } else if (type === 'both') {
      await bot.sendMessage(chatId, '⚡ Build kedua APK dimulai secara berurutan...');
      await buildOne(bot, chatId, 'biasa');
      await buildOne(bot, chatId, 'owner');
      await bot.sendMessage(chatId, '🎉 Kedua APK selesai direbuild!').catch(() => {});
    }
  });

  console.log('✅ Rebuild APK command registered - /rebuildapk');
}

module.exports = registerRebuildApk;
