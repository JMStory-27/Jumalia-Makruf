'use strict';

const { buildLawrenzAI, deployLawrenzAI, scanChanges, GH_PAGES_LAWRENZ } = require('./lawrenzaiBuild');

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}
function bar(pct, w = 14) {
  const f = Math.round(pct / 100 * w);
  return '█'.repeat(f) + '░'.repeat(w - f);
}

function getReplitUrl() {
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}/lawrenz/`;
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(',')[0].trim()}/lawrenz/`;
  return null;
}

async function takeScreenshot(url, waitMs = 8000) {
  try {
    const apiUrl =
      `https://api.microlink.io?url=${encodeURIComponent(url)}` +
      `&screenshot=true&meta=false&device=mobile&waitForTimeout=${waitMs}`;
    const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(55000) });
    const data   = await apiRes.json();
    if (data.status === 'success' && data.data?.screenshot?.url) {
      const imgRes = await fetch(data.data.screenshot.url, { signal: AbortSignal.timeout(20000) });
      if (imgRes.ok) return Buffer.from(await imgRes.arrayBuffer());
    }
    console.error('[pushlawrenzai] screenshot API:', JSON.stringify(data).slice(0, 200));
  } catch (e) {
    console.error('[pushlawrenzai] screenshot error:', e.message);
  }
  return null;
}

/* ── In-memory pending confirmations ─────────────────────────────────────── */
// key: `${chatId}:${msgId}` → { chatId, msgId, resolve }
const pending = new Map();

/* ── Main push flow ──────────────────────────────────────────────────────── */
async function runPushLawrenzAI(bot, chatId) {
  const replitUrl = getReplitUrl();
  const startTime = Date.now();
  const elapsed   = () => ((Date.now() - startTime) / 1000).toFixed(0);

  /* ── Step 1: Scan perubahan ── */
  const scanMsg = await bot.sendMessage(
    chatId,
    `🤖 *\\[LawrenZ AI\\] Memindai perubahan\\.\\.\\.*\n\n` +
    `📂 Membaca source code lawrenz\\-ai\\.\\.\\.\n` +
    `⏳ Sebentar\\.\\.\\.`,
    { parse_mode: 'MarkdownV2' }
  );

  let changes;
  try {
    changes = scanChanges();
  } catch (e) {
    changes = { modified: [], added: [], deleted: [], recent: [], error: e.message };
  }

  const modList  = changes.modified.slice(0, 10);
  const addList  = changes.added.slice(0, 5);
  const delList  = changes.deleted.slice(0, 5);
  const recentList = changes.recent.slice(0, 5);

  const totalChanged = modList.length + addList.length + delList.length;

  // Build scan summary
  let scanText = `🔍 *\\[LawrenZ AI\\] Hasil Scan Source Code*\n\n`;

  if (totalChanged === 0 && recentList.length === 0) {
    scanText +=
      `📦 *Tidak ada perubahan* yang terdeteksi di working tree\\.\n\n` +
      `_Kamu tetap bisa push untuk re\\-deploy versi terakhir\\._\n\n`;
  } else {
    if (modList.length > 0) {
      scanText += `✏️ *File dimodifikasi \\(${modList.length}\\):*\n`;
      scanText += modList.map(f => `  \\- \`${esc(f.split('/').pop())}\``).join('\n') + '\n\n';
    }
    if (addList.length > 0) {
      scanText += `➕ *File baru \\(${addList.length}\\):*\n`;
      scanText += addList.map(f => `  \\- \`${esc(f.split('/').pop())}\``).join('\n') + '\n\n';
    }
    if (delList.length > 0) {
      scanText += `🗑 *File dihapus \\(${delList.length}\\):*\n`;
      scanText += delList.map(f => `  \\- \`${esc(f.split('/').pop())}\``).join('\n') + '\n\n';
    }
    if (recentList.length > 0) {
      scanText += `📝 *5 Commit terakhir:*\n`;
      scanText += recentList.map(c => `  \`${esc(c)}\``).join('\n') + '\n\n';
    }
  }

  if (changes.error) {
    scanText += `⚠️ _Git scan: ${esc(changes.error.slice(0, 80))}_\n\n`;
  }

  scanText +=
    `🎯 *Target deploy:*\n` +
    `\`${esc(GH_PAGES_LAWRENZ)}\`\n\n` +
    `👇 *Klik tombol di bawah untuk konfirmasi push:*`;

  // Edit scan message, tambah tombol konfirmasi
  const confirmKey = `plz:${chatId}:${scanMsg.message_id}`;
  await bot.editMessageText(scanText, {
    chat_id:    chatId,
    message_id: scanMsg.message_id,
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Push & Deploy Sekarang!', callback_data: `${confirmKey}:ok` },
        { text: '❌ Batal',                  callback_data: `${confirmKey}:cancel` },
      ]],
    },
  });

  /* ── Step 2: Tunggu konfirmasi user (timeout 5 menit) ── */
  const confirmed = await new Promise((resolve) => {
    pending.set(confirmKey, resolve);
    setTimeout(() => {
      if (pending.has(confirmKey)) {
        pending.delete(confirmKey);
        resolve('timeout');
      }
    }, 5 * 60 * 1000);
  });

  // Hapus tombol setelah diklik
  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: chatId, message_id: scanMsg.message_id }
    );
  } catch (_) {}

  if (confirmed !== 'ok') {
    const msg = confirmed === 'timeout'
      ? '⏰ Konfirmasi timeout \\(5 menit\\)\\. Push dibatalkan\\.'
      : '❌ Push *dibatalkan* oleh user\\.';
    await bot.sendMessage(chatId, msg, { parse_mode: 'MarkdownV2' });
    return;
  }

  /* ── Step 3: Build + Deploy ── */
  const statusMsg = await bot.sendMessage(
    chatId,
    `🚀 *Push LawrenZ AI dimulai\\!*\n\n` +
    `\\[${esc(bar(0))}\\] *0%*\n` +
    `🔧 Memulai build web terbaru\\.\\.\\.\n` +
    `⏱ Waktu: 0 detik`,
    { parse_mode: 'MarkdownV2' }
  );

  const edit = async (pct, step) => {
    try {
      await bot.editMessageText(
        `🚀 *Push LawrenZ AI ke GitHub Pages\\.\\.\\.*\n\n` +
        `\\[${esc(bar(pct))}\\] *${pct}%*\n` +
        `🔧 ${esc(step)}\n` +
        `⏱ Waktu: ${esc(elapsed())} detik`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  };

  try {
    // Build
    await edit(5, 'Build LawrenZ AI (compile TypeScript + bundle assets)...');
    await buildLawrenzAI((step) => edit(15, step));
    await edit(40, 'Build selesai — semua perubahan sudah dikompilasi!');

    // Deploy
    await edit(42, 'Push ke GitHub Pages (upload file ke gh-pages branch)...');
    const deployResult = await deployLawrenzAI((step) => edit(50, step));
    const { filesTotal, filesChanged, commitSha } = deployResult || {};
    await edit(75, `Push selesai! Commit ${commitSha || '?'} — ${filesChanged || '?'} file diupload`);

    // Screenshot Replit (sebelum tunggu CDN)
    await edit(77, 'Ambil screenshot Replit preview...');
    const replitBuf = replitUrl ? await takeScreenshot(replitUrl, 6000) : null;

    // Tunggu CDN GitHub Pages (120 detik)
    await edit(80, 'Tunggu GitHub Pages CDN rebuild (60 detik pertama)...');
    await new Promise(r => setTimeout(r, 60000));
    await edit(86, 'Tunggu GitHub Pages CDN rebuild (60 detik kedua)...');
    await new Promise(r => setTimeout(r, 60000));

    // Screenshot GitHub Pages
    await edit(90, 'Ambil screenshot GitHub Pages (setelah CDN update)...');
    const ghPagesBuf = await takeScreenshot(GH_PAGES_LAWRENZ, 10000);
    await edit(97, 'Selesai! Mengirim hasil perbandingan...');

    const elapsedSec = elapsed();

    // Update status jadi selesai
    await bot.editMessageText(
      `✅ *Push LawrenZ AI Selesai\\!*\n\n` +
      `\\[${esc(bar(100))}\\] *100%*\n\n` +
      `📦 File: *${esc(String(filesChanged || '?'))} diupload* dari ${esc(String(filesTotal || '?'))} total\n` +
      `🔖 Commit: \`${esc(commitSha || '?')}\`\n` +
      `🌐 URL: \`${esc(GH_PAGES_LAWRENZ)}\`\n` +
      `⏱ Total: *${esc(elapsedSec)} detik*\n\n` +
      `📸 Screenshot perbandingan dikirim di bawah\\.\\.\\.`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
    );

    // Kirim screenshot Replit
    if (replitBuf) {
      await bot.sendPhoto(chatId, replitBuf, {
        caption:
          `📱 *Replit Preview \\(versi terbaru\\)*\n` +
          `🔗 \`${esc(replitUrl || '-')}\`\n\n` +
          `_Ini sumber kebenaran — harus identik dengan GitHub Pages_`,
        parse_mode:  'MarkdownV2',
        filename:    'replit-lawrenzai.png',
      });
    } else {
      await bot.sendMessage(chatId,
        `📱 *Replit Preview*\n🔗 \`${esc(replitUrl || '-')}\`\n\n_Screenshot gagal \\— buka link manual_`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    // Kirim screenshot GitHub Pages
    if (ghPagesBuf) {
      await bot.sendPhoto(chatId, ghPagesBuf, {
        caption:
          `🌐 *GitHub Pages \\(setelah push terbaru\\)*\n` +
          `🔗 \`${esc(GH_PAGES_LAWRENZ)}\`\n\n` +
          `_Bandingkan dengan screenshot Replit di atas — harus identik 100%_`,
        parse_mode: 'MarkdownV2',
        filename:   'github-pages-lawrenzai.png',
      });
    } else {
      await bot.sendMessage(chatId,
        `🌐 *GitHub Pages*\n🔗 \`${esc(GH_PAGES_LAWRENZ)}\`\n\n` +
        `_Screenshot gagal \\— GitHub Pages mungkin masih building\\. Cek manual\\._`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    // Ringkasan verifikasi akhir
    const bothOk = replitBuf && ghPagesBuf;
    await bot.sendMessage(chatId,
      `📊 *Hasil Verifikasi Push LawrenZ AI*\n\n` +
      `${replitBuf  ? '✅' : '⚠️'} Replit Preview: ${replitBuf  ? 'screenshot berhasil' : 'screenshot gagal'}\n` +
      `${ghPagesBuf ? '✅' : '⚠️'} GitHub Pages: ${ghPagesBuf ? 'screenshot berhasil' : 'mungkin masih building'}\n\n` +
      `🎉 *${esc(String(filesChanged))} file berhasil dipush ke GitHub Pages\\!*\n\n` +
      `🔗 Cek langsung: \`${esc(GH_PAGES_LAWRENZ)}\`\n\n` +
      `_Jika masih ada perbedaan setelah 2\\-3 menit, hard refresh browser \\(clear cache\\)_`,
      { parse_mode: 'MarkdownV2' }
    );

  } catch (e) {
    console.error('[pushlawrenzai]', e.message);
    try {
      await bot.editMessageText(
        `❌ *Push Gagal*\n\nError:\n\`${esc(e.message.slice(0, 400))}\`\n\n` +
        `_Cek log server untuk detail lebih lanjut_`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  }
}

/* ── Register command + callback handler ─────────────────────────────────── */
function registerPushLawrenzAICommand(bot) {
  // Handle /pushlawrenzai
  bot.onText(/^\/pushlawrenzai(?:\s|$)/i, async (msg) => {
    await runPushLawrenzAI(bot, msg.chat.id);
  });

  // Handle tombol konfirmasi (inline keyboard callback)
  bot.on('callback_query', async (query) => {
    const data   = query.data || '';
    const chatId = query.message?.chat?.id;

    // Hanya tangani callback yang sesuai prefix
    if (!data.startsWith('plz:')) return;

    const isOk = data.endsWith(':ok');
    const isCancel = data.endsWith(':cancel');
    if (!isOk && !isCancel) return;

    // Strip ":ok" / ":cancel" dari key
    const key = data.replace(/:ok$/, '').replace(/:cancel$/, '');

    if (pending.has(key)) {
      const resolve = pending.get(key);
      pending.delete(key);
      resolve(isOk ? 'ok' : 'cancel');
    }

    // Jawab callback agar tombol tidak loading terus
    try {
      await bot.answerCallbackQuery(query.id, {
        text: isOk ? '✅ Push dikonfirmasi! Proses dimulai...' : '❌ Push dibatalkan.',
        show_alert: false,
      });
    } catch (_) {}
  });
}

module.exports = { registerPushLawrenzAICommand };
