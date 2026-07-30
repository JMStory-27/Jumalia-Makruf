'use strict';

const { exec } = require('child_process');
const { promisify } = require('util');
const fs   = require('fs');
const path = require('path');

/** Escape semua reserved chars untuk Telegram MarkdownV2 */
function esc(s) {
  return String(s).replace(/([_*[\]()~`>#+\-=|{}.!\\<])/g, '\\$1');
}

const execAsync = promisify(exec);

/* ── Session management (alur /analisa) ─────────────────────────────────────── */
const sessions = new Map(); // chatId → { step, newUrl, ts }
const SESSION_TTL = 20 * 60 * 1000; // 20 menit

function sessSet(chatId, data) {
  sessions.set(String(chatId), { ...data, ts: Date.now() });
}
function sessGet(chatId) {
  const v = sessions.get(String(chatId));
  if (!v) return null;
  if (Date.now() - v.ts > SESSION_TTL) { sessions.delete(String(chatId)); return null; }
  return v;
}
function sessDelete(chatId) { sessions.delete(String(chatId)); }

/* ── Restore session storage (pending "Pulihkan" button) ─────────────────────── */
// restoreId → { tmpDir, oldRoot, onlyInOld, chatId }
const restoreSessions = new Map();
const RESTORE_TTL = 30 * 60 * 1000; // 30 menit

function storeRestoreSession(id, data) {
  restoreSessions.set(id, data);
  setTimeout(() => {
    const s = restoreSessions.get(id);
    if (s) {
      try { fs.rmSync(s.tmpDir, { recursive: true, force: true }); } catch {}
      restoreSessions.delete(id);
    }
  }, RESTORE_TTL);
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
function isValidUrl(str) {
  try { return ['http:', 'https:'].includes(new URL(str.trim()).protocol); } catch { return false; }
}

function fmtSize(bytes) {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Dapatkan semua path file secara rekursif relatif terhadap baseDir */
function getAllFiles(dir, baseDir, files = []) {
  if (!baseDir) baseDir = dir;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return files; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      getAllFiles(full, baseDir, files);
    } else {
      files.push(path.relative(baseDir, full));
    }
  }
  return files;
}

/** Download URL ke file lokal menggunakan curl */
async function downloadFile(url, dest) {
  const cmd = `curl -L --max-time 300 -f -o "${dest}" "${url}"`;
  await execAsync(cmd, { timeout: 320_000 });
}

/** Extract .tar.gz ke dir */
async function extractTar(tarPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  await execAsync(`tar -xzf "${tarPath}" -C "${destDir}"`, { timeout: 120_000, maxBuffer: 50 * 1024 * 1024 });
}

/** Cari root dir di dalam extracted dir (kadang ada 1 folder wrapper) */
function findExtractedRoot(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory());
    const files = entries.filter(e => !e.isDirectory());
    // Kalau isinya cuma 1 folder dan tidak ada file langsung → itu wrapper
    if (dirs.length === 1 && files.length === 0) {
      return path.join(dir, dirs[0].name);
    }
  } catch {}
  return dir;
}

/** Kelompokkan file berdasarkan dir pertamanya */
function groupByTopDir(fileList) {
  const map = {};
  for (const f of fileList) {
    const parts = f.split(path.sep);
    const top   = parts.length > 1 ? parts[0] : '(root)';
    if (!map[top]) map[top] = [];
    map[top].push(f);
  }
  return map;
}

/** Buat laporan .txt lengkap */
function buildReport({ newUrl, oldUrl, newSizeMB, oldSizeMB, newFiles, oldFiles, onlyInOld, onlyInNew, inBoth }) {
  const now      = new Date().toISOString();
  const lines    = [];
  const bar      = '='.repeat(65);
  const dash     = '-'.repeat(65);

  lines.push(bar);
  lines.push('  LAPORAN ANALISA PERBANDINGAN WORKSPACE');
  lines.push(`  Dibuat: ${now}`);
  lines.push(bar);
  lines.push('');

  lines.push('📦 WORKSPACE TERBARU (NEW)');
  lines.push(`   URL  : ${newUrl}`);
  lines.push(`   Size : ${newSizeMB} MB`);
  lines.push(`   Total: ${newFiles.length} file`);
  lines.push('');
  lines.push('📦 WORKSPACE LAMA / PEMBANDING (OLD)');
  lines.push(`   URL  : ${oldUrl}`);
  lines.push(`   Size : ${oldSizeMB} MB`);
  lines.push(`   Total: ${oldFiles.length} file`);
  lines.push('');

  lines.push(bar);
  lines.push('  RINGKASAN');
  lines.push(bar);
  lines.push(`  ❌ File di OLD tapi TIDAK ADA di NEW  : ${String(onlyInOld.length).padStart(5)} file`);
  lines.push(`  ✅ File di NEW tapi TIDAK ADA di OLD  : ${String(onlyInNew.length).padStart(5)} file`);
  lines.push(`  🔵 File yang ADA DI KEDUANYA          : ${String(inBoth.length).padStart(5)} file`);
  lines.push(`  ─────────────────────────────────────────────────────────────`);
  lines.push(`  Total file NEW                        : ${String(newFiles.length).padStart(5)} file`);
  lines.push(`  Total file OLD                        : ${String(oldFiles.length).padStart(5)} file`);
  lines.push('');

  lines.push(bar);
  lines.push(`  ❌ FILE YANG HILANG DI NEW`);
  lines.push(`     (Ada di OLD, tidak ada di NEW) — Total: ${onlyInOld.length} file`);
  lines.push(bar);

  if (onlyInOld.length === 0) {
    lines.push('  (tidak ada file yang hilang — workspace terbaru sudah lengkap)');
  } else {
    const grouped = groupByTopDir(onlyInOld);
    let idx = 1;
    for (const [topDir, files] of Object.entries(grouped).sort()) {
      lines.push('');
      lines.push(`  📁 ${topDir}/  (${files.length} file)`);
      lines.push(`  ${dash.slice(0, 62)}`);
      for (const f of files.sort()) {
        lines.push(`  ${String(idx).padStart(5, '0')}. ${f}`);
        idx++;
      }
    }
  }
  lines.push('');

  lines.push(bar);
  lines.push(`  ✅ FILE BARU DI NEW`);
  lines.push(`     (Ada di NEW, tidak ada di OLD) — Total: ${onlyInNew.length} file`);
  lines.push(bar);

  if (onlyInNew.length === 0) {
    lines.push('  (tidak ada file baru — identik dengan OLD)');
  } else {
    const grouped = groupByTopDir(onlyInNew);
    let idx = 1;
    for (const [topDir, files] of Object.entries(grouped).sort()) {
      lines.push('');
      lines.push(`  📁 ${topDir}/  (${files.length} file)`);
      lines.push(`  ${dash.slice(0, 62)}`);
      for (const f of files.sort()) {
        lines.push(`  ${String(idx).padStart(5, '0')}. ${f}`);
        idx++;
      }
    }
  }
  lines.push('');

  lines.push(bar);
  lines.push(`  🔵 FILE YANG ADA DI KEDUANYA`);
  lines.push(`     Total: ${inBoth.length} file`);
  lines.push(bar);

  if (inBoth.length === 0) {
    lines.push('  (tidak ada file yang sama)');
  } else {
    const grouped = groupByTopDir(inBoth);
    let idx = 1;
    for (const [topDir, files] of Object.entries(grouped).sort()) {
      lines.push('');
      lines.push(`  📁 ${topDir}/  (${files.length} file)`);
      lines.push(`  ${dash.slice(0, 62)}`);
      for (const f of files.sort()) {
        lines.push(`  ${String(idx).padStart(5, '0')}. ${f}`);
        idx++;
      }
    }
  }
  lines.push('');

  lines.push(bar);
  lines.push('  END OF REPORT');
  lines.push(bar);
  lines.push('');

  return lines.join('\n');
}

/* ── Restore logic ───────────────────────────────────────────────────────────── */
async function runRestore(bot, chatId, progMsgId, restoreData) {
  const { tmpDir, oldRoot, onlyInOld } = restoreData;
  const WORKSPACE = '/home/runner/workspace';

  let copied  = 0;
  let skipped = 0;
  const failed = [];

  for (const f of onlyInOld) {
    // Lewati file internal Replit
    if (f.includes('.replit-artifact') || f === '.replit') {
      skipped++;
      continue;
    }

    const src = path.join(oldRoot, f);
    const dst = path.join(WORKSPACE, f);

    // Hanya tambahkan file yang BELUM ADA di workspace sekarang — jangan overwrite
    if (fs.existsSync(dst)) {
      skipped++;
      continue;
    }

    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      copied++;
    } catch (e) {
      failed.push(f);
    }
  }

  // Cleanup tmp setelah copy
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  // Git commit + push supaya file ikut ke GitHub remix
  let gitStatus = '';
  if (copied > 0) {
    try {
      await execAsync(`cd "${WORKSPACE}" && git add -A`, { timeout: 30_000 });
      await execAsync(
        `cd "${WORKSPACE}" && git commit -m "restore: tambahkan ${copied} file dari workspace lama"`,
        { timeout: 30_000 }
      );
      gitStatus += '✅ Git commit berhasil\n';

      const githubToken = process.env.GITHUB_TOKEN;
      const githubOwner = process.env.GITHUB_OWNER;
      const githubRepo  = process.env.GITHUB_REPO;

      if (githubToken && githubOwner && githubRepo) {
        await execAsync(
          `cd "${WORKSPACE}" && git push https://${githubToken}@github.com/${githubOwner}/${githubRepo}.git HEAD`,
          { timeout: 60_000 }
        );
        gitStatus += `✅ Push ke github\\.com/${esc(githubOwner)}/${esc(githubRepo)} berhasil\n`;
      } else {
        gitStatus += '⚠️ GITHUB\\_TOKEN/OWNER/REPO belum di\\-set, push dilewati\n';
      }
    } catch (e) {
      const msg = (e.message || '').slice(0, 150).replace(/https?:\/\/[^@]+@/g, 'https://***@');
      gitStatus += `⚠️ Git error: ${esc(msg)}\n`;
    }
  } else {
    gitStatus = '_Tidak ada file baru yang disalin, tidak perlu commit\\_\n';
  }

  const failedLine = failed.length > 0
    ? `❌ Gagal disalin: *${failed.length}* file\n`
    : '';

  const summary =
    `✅ *Pemulihan Selesai\\!*\n\n` +
    `📁 File berhasil ditambahkan: *${esc(String(copied))}*\n` +
    `⏭️ Dilewati \\(sudah ada / internal\\): *${esc(String(skipped))}*\n` +
    failedLine +
    `\n${gitStatus}`;

  await bot.editMessageText(summary, {
    chat_id: chatId,
    message_id: progMsgId,
    parse_mode: 'MarkdownV2',
  }).catch(() =>
    bot.sendMessage(chatId, summary, { parse_mode: 'MarkdownV2' })
  );
}

/* ── Main registration ──────────────────────────────────────────────────────── */
function registerAnalisaCommand(bot) {
  /* /analisa — mulai alur analisa */
  bot.onText(/^\/analisa(?:\s|$)/i, async (msg) => {
    const chatId = msg.chat.id;
    sessDelete(chatId);
    sessSet(chatId, { step: 'wait_new_url' });

    await bot.sendMessage(chatId,
      `🔍 *Analisa Perbandingan Workspace*\n\n` +
      `Kirim *link download workspace terbaru* \\(yang ingin dicek\\):\n\n` +
      `_Contoh:_\n` +
      `\`https://github\\.com/user/repo/releases/download/tag/workspace\\.tar\\.gz\``,
      { parse_mode: 'MarkdownV2' }
    );
  });

  /* ── Handler tombol inline "Pulihkan" ─────────────────────────────────────── */
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('pulihkan_')) return;

    const restoreId = data.slice('pulihkan_'.length);

    // Selalu jawab callback supaya loading spinner hilang
    await bot.answerCallbackQuery(query.id, { text: '⏳ Memulai pemulihan...' }).catch(() => {});

    const sess = restoreSessions.get(restoreId);
    if (!sess) {
      await bot.sendMessage(query.message.chat.id,
        '⚠️ Sesi restore sudah kadaluarsa \\(>30 menit\\)\\. Jalankan */analisa* ulang\\.',
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    // Hapus dari map supaya tombol tidak bisa diklik dua kali
    restoreSessions.delete(restoreId);

    // Nonaktifkan tombol di pesan lama
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: query.message.chat.id, message_id: query.message.message_id }
    ).catch(() => {});

    const progMsg = await bot.sendMessage(
      query.message.chat.id,
      `⏳ Sedang memulihkan *${esc(String(sess.onlyInOld.length))}* file ke workspace\\.\\.\\.\n_Hanya file yang belum ada yang akan ditambahkan_`,
      { parse_mode: 'MarkdownV2' }
    );

    await runRestore(bot, query.message.chat.id, progMsg.message_id, sess);
  });

  /* ── Handler pesan teks untuk menangkap URL ──────────────────────────────── */
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const sess   = sessGet(chatId);
    if (!sess) return;

    // Jangan intercept perintah bot lain
    if (msg.text?.startsWith('/')) return;

    const text = (msg.text || '').trim();
    if (!text) return;

    /* ── Step 1: Terima URL workspace terbaru ── */
    if (sess.step === 'wait_new_url') {
      if (!isValidUrl(text)) {
        return bot.sendMessage(chatId, '⚠️ URL tidak valid\\. Kirim URL http/https yang benar\\.', { parse_mode: 'MarkdownV2' });
      }
      sessSet(chatId, { step: 'wait_old_url', newUrl: text });
      await bot.sendMessage(chatId,
        `✅ URL terbaru diterima\\.\n\n` +
        `Sekarang kirim *link download workspace lama/pembanding* \\(untuk dibandingkan\\):`,
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    /* ── Step 2: Terima URL workspace lama, mulai analisa ── */
    if (sess.step === 'wait_old_url') {
      if (!isValidUrl(text)) {
        return bot.sendMessage(chatId, '⚠️ URL tidak valid\\. Kirim URL http/https yang benar\\.', { parse_mode: 'MarkdownV2' });
      }

      const newUrl = sess.newUrl;
      const oldUrl = text.trim();
      sessDelete(chatId);

      const progMsg = await bot.sendMessage(chatId, '⏳ Mengunduh kedua workspace secara paralel...');

      try {
        const tmpDir = `/tmp/analisa_${Date.now()}`;
        fs.mkdirSync(tmpDir, { recursive: true });

        const newTar    = path.join(tmpDir, 'new.tar.gz');
        const oldTar    = path.join(tmpDir, 'old.tar.gz');
        const newExtDir = path.join(tmpDir, 'new');
        const oldExtDir = path.join(tmpDir, 'old');

        /* 1. Download KEDUA workspace secara paralel (hemat ~50% waktu) */
        await Promise.all([
          downloadFile(newUrl, newTar),
          downloadFile(oldUrl, oldTar),
        ]);

        const newSizeMB = (fs.statSync(newTar).size / 1024 / 1024).toFixed(1);
        const oldSizeMB = (fs.statSync(oldTar).size / 1024 / 1024).toFixed(1);

        await bot.editMessageText(
          `✅ Kedua workspace diunduh (${newSizeMB} MB + ${oldSizeMB} MB).\n\n⏳ Sedang mengekstrak...`,
          { chat_id: chatId, message_id: progMsg.message_id }
        ).catch(() => {});

        /* 2. Ekstrak secara paralel */
        await Promise.all([
          extractTar(newTar, newExtDir),
          extractTar(oldTar, oldExtDir),
        ]);

        await bot.editMessageText(
          `✅ Ekstraksi selesai.\n\n🔍 Sedang menganalisa & membandingkan file...`,
          { chat_id: chatId, message_id: progMsg.message_id }
        ).catch(() => {});

        /* 4. Dapatkan root sebenarnya (skip wrapper folder) */
        const newRoot = findExtractedRoot(newExtDir);
        const oldRoot = findExtractedRoot(oldExtDir);

        /* 5. Daftar semua file */
        const newFileSet = new Set(getAllFiles(newRoot));
        const oldFileSet = new Set(getAllFiles(oldRoot));

        const newFiles  = [...newFileSet].sort();
        const oldFiles  = [...oldFileSet].sort();
        const onlyInOld = oldFiles.filter(f => !newFileSet.has(f));
        const onlyInNew = newFiles.filter(f => !oldFileSet.has(f));
        const inBoth    = oldFiles.filter(f => newFileSet.has(f));

        /* 6. Buat laporan */
        const reportText = buildReport({
          newUrl, oldUrl, newSizeMB, oldSizeMB,
          newFiles, oldFiles,
          onlyInOld, onlyInNew, inBoth,
        });

        const reportPath = path.join(tmpDir, 'laporan-analisa.txt');
        fs.writeFileSync(reportPath, reportText, 'utf8');
        const reportSize = fmtSize(fs.statSync(reportPath).size);

        await bot.editMessageText(
          `✅ Analisa selesai! Sedang mengirim laporan...`,
          { chat_id: chatId, message_id: progMsg.message_id }
        ).catch(() => {});

        /* 7. Kirim laporan sebagai file .txt */
        const caption =
          `📊 *Laporan Analisa Workspace*\n\n` +
          `❌ File hilang di NEW: *${onlyInOld.length}* file\n` +
          `✅ File baru di NEW: *${onlyInNew.length}* file\n` +
          `🔵 File sama di keduanya: *${inBoth.length}* file\n\n` +
          `📦 NEW: ${esc(newSizeMB)} MB \\| OLD: ${esc(oldSizeMB)} MB\n` +
          `📄 Laporan: ${esc(reportSize)}`;

        await bot.sendDocument(chatId, reportPath, {
          caption,
          parse_mode: 'MarkdownV2',
        }, {
          filename: `laporan-analisa-${Date.now()}.txt`,
          contentType: 'text/plain',
        });

        /* 8. Tampilkan tombol "Pulihkan" jika ada file hilang */
        if (onlyInOld.length > 0) {
          const restoreId = `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

          // Simpan data untuk restore — tmpDir TIDAK dihapus dulu
          storeRestoreSession(restoreId, { tmpDir, oldRoot, onlyInOld });

          await bot.sendMessage(chatId,
            `🔁 Ditemukan *${esc(String(onlyInOld.length))} file* yang ada di OLD tapi tidak ada di NEW\\.\n\n` +
            `Klik *Pulihkan* untuk menambahkan file\\-file tersebut ke workspace sekarang\\.\n\n` +
            `⚠️ _Hanya file yang belum ada di workspace yang akan ditambahkan\\. File yang sudah ada tidak akan diubah sama sekali\\._`,
            {
              parse_mode: 'MarkdownV2',
              reply_markup: {
                inline_keyboard: [[
                  { text: '🔁 Pulihkan File Hilang', callback_data: `pulihkan_${restoreId}` },
                ]],
              },
            }
          );
        } else {
          // Tidak ada file hilang — langsung cleanup
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
          await bot.sendMessage(chatId,
            '✅ Tidak ada file yang hilang\\. Workspace terbaru sudah lengkap\\!',
            { parse_mode: 'MarkdownV2' }
          );
        }

      } catch (e) {
        console.error('[analisa] error:', e.message);
        const safeMsg = (e.message || 'unknown error').slice(0, 200).replace(/[\\`]/g, '\\$&');
        await bot.editMessageText(
          `❌ *Gagal analisa:*\n\`${safeMsg}\``,
          { chat_id: chatId, message_id: progMsg.message_id, parse_mode: 'MarkdownV2' }
        ).catch(() => bot.sendMessage(chatId, `❌ Gagal: ${e.message?.slice(0, 200)}`));
      }
    }
  });
}

module.exports = { registerAnalisaCommand };
