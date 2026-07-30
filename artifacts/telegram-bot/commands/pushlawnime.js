'use strict';

const { buildAnisub, deployToGithubPages, GH_PAGES_ANIME_URL } = require('./lawnimeBuild');

function esc(s) {
  return String(s).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function bar(pct, w = 14) {
  const f = Math.round(pct / 100 * w);
  return '█'.repeat(f) + '░'.repeat(w - f);
}

function getReplitUrl() {
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}/anisub/`;
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(',')[0].trim()}/anisub/`;
  return null;
}

async function takeScreenshot(url, waitMs = 6000) {
  try {
    const apiUrl =
      `https://api.microlink.io?url=${encodeURIComponent(url)}` +
      `&screenshot=true&meta=false&device=mobile&waitForTimeout=${waitMs}`;
    const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(50000) });
    const data = await apiRes.json();
    if (data.status === 'success' && data.data?.screenshot?.url) {
      const imgRes = await fetch(data.data.screenshot.url, {
        signal: AbortSignal.timeout(20000),
      });
      if (imgRes.ok) return Buffer.from(await imgRes.arrayBuffer());
    }
    console.error('[pushlawnime] screenshot API:', JSON.stringify(data).slice(0, 200));
  } catch (e) {
    console.error('[pushlawnime] screenshot error:', e.message);
  }
  return null;
}

async function runPushLawnime(bot, chatId) {
  const replitUrl = getReplitUrl();
  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(0);

  const statusMsg = await bot.sendMessage(
    chatId,
    `🚀 *Push Lawnime ke GitHub Pages dimulai\\!*\n\n` +
    `\\[░░░░░░░░░░░░░░\\] *0%*\n` +
    `🔧 Memulai build web terbaru\\.\\.\\.\n` +
    `⏱ Waktu: 0 detik`,
    { parse_mode: 'MarkdownV2' }
  );

  const edit = async (pct, step) => {
    try {
      await bot.editMessageText(
        `🚀 *Push Lawnime ke GitHub Pages\\.\\.\\.*\n\n` +
        `\\[${esc(bar(pct))}\\] *${pct}%*\n` +
        `🔧 ${esc(step)}\n` +
        `⏱ Waktu: ${esc(elapsed())} detik`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  };

  try {
    // Step 1: Build
    await edit(5, 'Build web Lawnime terbaru (baca semua source code)...');
    await buildAnisub((step) => edit(10, step));
    await edit(40, 'Build selesai — semua perubahan source sudah dikompilasi!');

    // Step 2: Push to GitHub Pages
    await edit(42, 'Push ke GitHub Pages (upload semua file)...');
    const deployResult = await deployToGithubPages((step) => edit(45, step));
    const { filesTotal, filesChanged, commitSha } = deployResult || {};
    await edit(75, `Push selesai! Commit ${commitSha || '?'} — ${filesChanged || '?'} dari ${filesTotal || '?'} file diperbarui`);

    // Step 3: Screenshot Replit before waiting
    await edit(77, 'Ambil screenshot Replit preview...');
    const replitBuf = replitUrl ? await takeScreenshot(replitUrl, 5000) : null;

    // Step 4: Wait for GitHub Pages CDN to propagate (minimum 60 detik)
    await edit(82, 'Tunggu GitHub Pages CDN rebuild (60 detik)...');
    await new Promise(r => setTimeout(r, 30000));
    await edit(86, 'Tunggu GitHub Pages CDN rebuild (30 detik lagi)...');
    await new Promise(r => setTimeout(r, 30000));

    // Step 5: Screenshot GitHub Pages (pakai URL /anime/ langsung)
    await edit(90, 'Ambil screenshot GitHub Pages (setelah CDN update)...');
    const ghPagesBuf = await takeScreenshot(GH_PAGES_ANIME_URL + '?nosplash', 10000);
    await edit(97, 'Selesai! Mengirim hasil perbandingan...');

    const elapsedSec = elapsed();

    // Done message with deploy details
    await bot.editMessageText(
      `✅ *Push Lawnime Selesai\\!*\n\n` +
      `\\[${esc(bar(100))}\\] *100%*\n\n` +
      `📦 File: *${esc(String(filesChanged || '?'))} diperbarui* dari ${esc(String(filesTotal || '?'))} total\n` +
      `🔖 Commit: \`${esc(commitSha || '?')}\`\n` +
      `🌐 URL: \`${esc(GH_PAGES_ANIME_URL)}\`\n` +
      `⏱ Total: *${esc(elapsedSec)} detik*\n\n` +
      `📸 Screenshot perbandingan dikirim di bawah\\.\\.\\.`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
    );

    // Send Replit screenshot
    if (replitBuf) {
      await bot.sendPhoto(chatId, replitBuf, {
        caption:
          `📱 *Replit Preview \\(versi terbaru\\)*\n` +
          `🔗 \`${esc(replitUrl || '-')}\`\n\n` +
          `_Ini sumber kebenaran tampilan yang seharusnya identik dengan GitHub Pages_`,
        parse_mode: 'MarkdownV2',
        filename: 'replit-preview.png',
      });
    } else {
      await bot.sendMessage(chatId,
        `📱 *Replit Preview*\n🔗 \`${esc(replitUrl || '-')}\`\n\n_Screenshot gagal \\— buka link manual_`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    // Send GitHub Pages screenshot
    if (ghPagesBuf) {
      await bot.sendPhoto(chatId, ghPagesBuf, {
        caption:
          `🌐 *GitHub Pages \\(setelah push terbaru\\)*\n` +
          `🔗 \`${esc(GH_PAGES_ANIME_URL)}\`\n\n` +
          `_Bandingkan dengan screenshot Replit di atas — harus identik_`,
        parse_mode: 'MarkdownV2',
        filename: 'github-pages.png',
      });
    } else {
      await bot.sendMessage(chatId,
        `🌐 *GitHub Pages*\n🔗 \`${esc(GH_PAGES_ANIME_URL)}\`\n\n` +
        `_Screenshot gagal \\— GitHub Pages mungkin masih building\\. Cek manual di link di atas_`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    // Final comparison summary
    const bothOk = replitBuf && ghPagesBuf;
    const summary = filesChanged === 0
      ? `ℹ️ *Source tidak berubah* — tidak ada perbedaan dari versi sebelumnya\\.\nTampilan GitHub Pages seharusnya sudah identik dengan Replit\\.`
      : `🎉 *${esc(String(filesChanged))} file baru berhasil dipush ke GitHub Pages\\!*`;

    await bot.sendMessage(
      chatId,
      `📊 *Hasil Verifikasi Push*\n\n` +
      `${replitBuf ? '✅' : '⚠️'} Replit Preview: ${replitBuf ? 'screenshot berhasil' : 'screenshot gagal'}\n` +
      `${ghPagesBuf ? '✅' : '⚠️'} GitHub Pages: ${ghPagesBuf ? 'screenshot berhasil' : 'mungkin masih building'}\n\n` +
      `${summary}\n\n` +
      `🔗 Cek langsung: \`${esc(GH_PAGES_ANIME_URL)}\`\n\n` +
      `_Jika masih ada perbedaan setelah 2\\-3 menit, hard refresh browser \\(clear cache\\)_`,
      { parse_mode: 'MarkdownV2' }
    );

  } catch (e) {
    console.error('[pushlawnime]', e.message);
    try {
      await bot.editMessageText(
        `❌ *Push Gagal*\n\nError:\n\`${esc(e.message.slice(0, 400))}\`\n\n` +
        `_Cek log server untuk detail lebih lanjut_`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  }
}

function registerPushLawnimeCommand(bot) {
  bot.onText(/^\/pushlawnime(?:\s|$)/i, async (msg) => {
    await runPushLawnime(bot, msg.chat.id);
  });
}

module.exports = { registerPushLawnimeCommand };
