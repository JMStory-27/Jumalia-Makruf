'use strict';

// /update — trigger auto-scrape lengkap AniSub (semua fitur ⚡) langsung dari
// Telegram, tanpa perlu buka web AniSub. Admin-only. Laporan lengkap tiap
// fitur dikirim rapi + file .txt (biar muat semua detail tanpa batas panjang pesan).

const API_BASE = 'http://localhost:8080/api';

function esc(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function bar(pct, w = 16) {
  const f = Math.round((pct / 100) * w);
  return '█'.repeat(Math.max(0, f)) + '░'.repeat(Math.max(0, w - f));
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path) {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', signal: AbortSignal.timeout(15000) });
  if (res.status === 409) return { alreadyRunning: true };
  if (!res.ok && res.status !== 202) throw new Error(`API ${path} → HTTP ${res.status}`);
  return { accepted: true };
}

function fmtList(arr, empty = '_tidak ada_') {
  if (!arr || arr.length === 0) return empty;
  return arr.map((t) => `• ${t}`).join('\n');
}

/** Bangun laporan .txt lengkap — 1 seksi per fitur nomer, urut & jelas. */
function buildFullReportText(result) {
  const d = result.detail;
  const dt = new Date(result.finishedAt).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' });
  const durSec = ((result.finishedAt - result.startedAt) / 1000).toFixed(1);

  const lines = [];
  lines.push('══════════════════════════════════════════');
  lines.push('   LAPORAN AUTO-SCRAPE ANISUB (⚡)');
  lines.push('══════════════════════════════════════════');
  lines.push(`Waktu selesai   : ${dt}`);
  lines.push(`Trigger         : ${result.trigger === 'manual' ? 'Manual (via /update Telegram)' : 'Otomatis (jadwal server)'}`);
  lines.push(`Durasi proses   : ${durSec} detik`);
  lines.push(`Status          : ${result.ok ? 'BERHASIL' : 'ADA ERROR'}`);
  lines.push(`Total ongoing   : ${result.totalOngoing} anime`);
  lines.push(`Total completed : ${result.totalCompleted} anime`);
  lines.push(`Total semua     : ${result.totalAnime} anime (ongoing + completed, DICEK SEMUA — bukan cuma ongoing)`);
  lines.push('');

  lines.push('── #1. Auto-tambah anime baru rilis ke jadwal ──');
  lines.push(`Ditemukan ${result.newAnimeCount} anime baru:`);
  lines.push(fmtList(result.newAnimeTitles));
  lines.push('');

  lines.push('── #2 & #3. Auto-hapus dari jadwal & pindah ke Completed (anime tamat) ──');
  lines.push(`Terdeteksi tamat & dihapus dari daftar ongoing: ${result.removedCount} anime`);
  lines.push(fmtList(result.removedTitles));
  lines.push(`Anime baru yang masuk daftar completed (dikonfirmasi dari halaman Completed): ${result.newCompletedCount}`);
  lines.push(fmtList(result.newCompletedTitles));
  lines.push('');

  lines.push('── #17. Auto-update jumlah total episode ──');
  lines.push(`Episode baru terdeteksi naik: ${result.episodeBumpCount} anime`);
  lines.push(fmtList(result.episodeBumpTitles));
  if (d.episodeCountUpdated.length) {
    lines.push(`Jumlah total episode berubah (dikonfirmasi via detail): ${d.episodeCountUpdated.length}`);
    lines.push(fmtList(d.episodeCountUpdated));
  }
  lines.push('');

  lines.push('── Sweep menyeluruh (cek SEMUA anime, ongoing + completed, bertahap) ──');
  lines.push(`Progress kumulatif: ${result.sweep.coveredSoFar}/${result.sweep.totalUnique} anime sudah pernah diverifikasi field-nya`);
  lines.push(`Sudah menyelesaikan ${result.sweep.cycleCount} putaran penuh ke semua anime`);
  lines.push('(Karena data ribuan anime & butuh hormat rate-limit sumber, verifikasi jalan bertahap beberapa anime per run — bukan cuma yang baru rilis. Biarkan auto-scrape jalan terus atau /update berkala untuk mempercepat cakupan.)');
  lines.push('');

  lines.push(`── Enrichment detail run ini (antrian diproses: ${d.processed}/${d.queued}, sisa retry queue: ${d.retryQueueSize}) ──`);
  lines.push('');

  lines.push('── #4. Auto-generate banner/thumbnail ──');
  lines.push(`Banner terisi/terverifikasi: ${d.bannerFilled.length} anime`);
  lines.push(fmtList(d.bannerFilled));
  lines.push('');

  lines.push('── #5. Auto-crop/optimize banner ──');
  lines.push('Optimasi rasio dilakukan otomatis di sisi tampilan (CSS object-fit) untuk semua banner di atas — tidak butuh proses crop terpisah karena sumber gambar sudah landscape/portrait standar.');
  lines.push('');

  lines.push('── #6. Auto-isi sinopsis ──');
  lines.push(`Sinopsis terisi: ${d.synopsisFilled.length} anime`);
  lines.push(fmtList(d.synopsisFilled));
  lines.push('');

  lines.push('── #8. Auto-isi staff (studio) ──');
  lines.push(`Studio terisi: ${d.studioFilled.length} anime`);
  lines.push(fmtList(d.studioFilled));
  lines.push('');

  lines.push('── #9 & #10. Auto-isi karakter, pengisi suara & trailer ──');
  lines.push(`STATUS: TIDAK TERSEDIA — ${d.charactersNote}`);
  lines.push('');

  lines.push('── #11. Auto-isi genre & tag ──');
  lines.push(`Genre terisi: ${d.genreFilled.length} anime`);
  lines.push(fmtList(d.genreFilled));
  lines.push('');

  lines.push('── #12. Auto-isi rating/skor ──');
  lines.push(`Skor terisi: ${d.scoreFilled.length} anime`);
  lines.push(fmtList(d.scoreFilled));
  if (d.scoreFilled.length === 0 && d.processed > 0) {
    lines.push('(Catatan: sumber otakudesu sering tidak mencantumkan skor untuk anime yang baru rilis)');
  }
  lines.push('');

  lines.push('── #14. Auto-deteksi musim rilis ──');
  lines.push(`Musim terdeteksi: ${d.seasonDetected.length} anime`);
  lines.push(fmtList(d.seasonDetected));
  lines.push('');

  lines.push('── #33. Auto-retry queue (episode/data yang gagal di-scrape) ──');
  lines.push(`Gagal di run ini: ${d.failed}/${d.processed}`);
  lines.push(fmtList(d.failedTitles));
  lines.push(`Total masih di antrian retry untuk run berikutnya: ${d.retryQueueSize}`);
  lines.push('');

  lines.push('── Sinkronisasi GitHub ──');
  lines.push(result.githubSynced ? 'Berhasil push snapshot data/ongoing.json ke GitHub' : 'Tidak disinkron (GITHUB_TOKEN/OWNER/REPO belum diset, atau push gagal)');
  lines.push('');

  if (result.errors.length) {
    lines.push('── Error / Warning ──');
    lines.push(fmtList(result.errors, '_tidak ada_'));
    lines.push('');
  }

  lines.push('══════════════════════════════════════════');
  lines.push('Auto-scrape berjalan MUTLAK tiap 5 menit dari server,');
  lines.push('terlepas dari apakah ada yang buka AniSub atau tidak.');
  lines.push('══════════════════════════════════════════');

  return lines.join('\n');
}

async function runUpdateAnime(bot, chatId) {
  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(0);
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;

  const statusMsg = await bot.sendMessage(
    chatId,
    `⚡ *Auto\\-Scrape AniSub dimulai\\!*\n\n` +
    `\\[${esc(bar(0))}\\] *0%*\n` +
    `🔧 Menghubungi server scrape\\.\\.\\.\n` +
    `⏱ Waktu: 0 detik`,
    { parse_mode: 'MarkdownV2' }
  );

  const edit = async (pct, step, extra = '') => {
    frame = (frame + 1) % spinnerFrames.length;
    try {
      await bot.editMessageText(
        `${spinnerFrames[frame]} *Auto\\-Scrape AniSub sedang berjalan\\.\\.\\.*\n\n` +
        `\\[${esc(bar(pct))}\\] *${pct}%*\n` +
        `🔧 ${esc(step)}\n` +
        `⏱ Waktu: ${esc(elapsed())} detik` +
        (extra ? `\n\n${extra}` : ''),
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) { /* ignore edit race errors */ }
  };

  try {
    await edit(5, 'Trigger scrape manual ke api-server...');
    const trigger = await apiPost('/scrape/run');

    if (trigger.alreadyRunning) {
      await edit(10, 'Scrape lain sedang berjalan — menunggu selesai...');
    }

    // Poll status sampai selesai (running: false) & lastResult berubah.
    const before = await apiGet('/scrape/status');
    const beforeId = before.lastResult?.id || null;

    let last = before;
    let pct = 15;
    const maxWaitMs = 90_000;
    const pollStart = Date.now();
    while (Date.now() - pollStart < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 1800));
      last = await apiGet('/scrape/status');
      pct = Math.min(90, pct + 6);
      const stage = last.running
        ? 'Scraping ongoing list & mengambil detail anime (banner, sinopsis, genre, skor, studio, season)...'
        : 'Finalisasi & sinkronisasi GitHub...';
      await edit(pct, stage);
      if (!last.running && last.lastResult && last.lastResult.id !== beforeId) break;
    }

    if (last.running || !last.lastResult || last.lastResult.id === beforeId) {
      await bot.editMessageText(
        `⚠️ *Timeout menunggu hasil scrape*\n\n` +
        `Scrape mungkin masih berjalan di background \\(upstream lambat/rate\\-limited\\)\\.\n` +
        `Cek lagi dengan /update dalam 1\\-2 menit, atau pantau di panel web AniSub \\(tombol ⚡\\)\\.`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const result = last.lastResult;
    await edit(97, 'Menyusun laporan lengkap...');

    const d = result.detail;
    const summary =
      `✅ *Auto\\-Scrape AniSub Selesai\\!*\n\n` +
      `\\[${esc(bar(100))}\\] *100%*\n` +
      `⏱ Total: *${esc(elapsed())} detik*\n\n` +
      `📊 *Ringkasan \\(ongoing \\+ completed, cek menyeluruh\\):*\n` +
      `📚 Total dicek: *${esc(String(result.totalAnime))}* anime \\(${esc(String(result.totalOngoing))} ongoing \\+ ${esc(String(result.totalCompleted))} completed\\)\n` +
      `🆕 Anime baru: *${esc(String(result.newAnimeCount))}*\n` +
      `🎬 Episode naik: *${esc(String(result.episodeBumpCount))}*\n` +
      `🗑 Tamat \\(auto\\-hapus dari jadwal\\): *${esc(String(result.removedCount))}*\n` +
      `✅ Baru masuk completed: *${esc(String(result.newCompletedCount))}*\n` +
      `🔁 Sweep menyeluruh: *${esc(String(result.sweep.coveredSoFar))}/${esc(String(result.sweep.totalUnique))}* \\(putaran ke\\-${esc(String(result.sweep.cycleCount))}\\)\n` +
      `🖼 Banner terisi: *${esc(String(d.bannerFilled.length))}*\n` +
      `📝 Sinopsis terisi: *${esc(String(d.synopsisFilled.length))}*\n` +
      `🎭 Genre terisi: *${esc(String(d.genreFilled.length))}*\n` +
      `⭐ Skor terisi: *${esc(String(d.scoreFilled.length))}*\n` +
      `🏢 Studio terisi: *${esc(String(d.studioFilled.length))}*\n` +
      `🗓 Musim terdeteksi: *${esc(String(d.seasonDetected.length))}*\n` +
      `♻️ Retry queue tersisa: *${esc(String(d.retryQueueSize))}*\n` +
      `☁️ GitHub sync: *${result.githubSynced ? 'berhasil' : 'dilewati'}*\n` +
      (result.errors.length ? `⚠️ Error: *${esc(String(result.errors.length))}*\n` : '') +
      `\n👥 Karakter/seiyuu: _tidak tersedia dari sumber_\n\n` +
      `📄 Laporan lengkap per\\-fitur dikirim sebagai file di bawah\\.\\.\\.`;

    await bot.editMessageText(summary, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' });

    const reportText = buildFullReportText(result);
    const fileName = `anisub-scrape-report-${new Date(result.finishedAt).toISOString().replace(/[:.]/g, '-')}.txt`;
    await bot.sendDocument(chatId, Buffer.from(reportText, 'utf-8'), {
      caption: '📄 Laporan lengkap auto-scrape AniSub (semua fitur ⚡, urut & rinci)',
    }, { filename: fileName, contentType: 'text/plain' });

  } catch (e) {
    console.error('[updateanime]', e && e.message);
    try {
      await bot.editMessageText(
        `❌ *Auto\\-Scrape Gagal*\n\nError:\n\`${esc(String(e && e.message || e).slice(0, 400))}\`\n\n` +
        `_Pastikan API Server \\(artifacts/api\\-server\\) sedang berjalan_`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) { /* ignore */ }
  }
}

function registerUpdateAnimeCommand(bot, ownerId) {
  bot.onText(/^\/update(?:\s|$)/i, async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from ? String(msg.from.id) : null;
    if (ownerId && fromId !== ownerId) {
      await bot.sendMessage(chatId, '🔒 Command ini khusus admin/owner.');
      return;
    }
    await runUpdateAnime(bot, chatId);
  });
}

module.exports = { registerUpdateAnimeCommand };
