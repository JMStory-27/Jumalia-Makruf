'use strict';

// /scrapeanisub — trigger scrape ulang cache AniSub dari Telegram (owner-only)
// Modes:
//   /scrapeanisub         → resume (skip yang sudah selesai, retry yang gagal)
//   /scrapeanisub fresh   → mulai dari awal (hapus semua progress, scrape semua anime)
//   /scrapeanisub turbo   → SUPER CEPAT: reuse cache lama, hanya scrape anime baru (< 10 menit)
//   /scrapeanisub turbo full → fresh total tapi tetap paralel (< 30 menit)
//   /scrapeanisub report  → kirim laporan terakhir saja tanpa scrape ulang

const fs   = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const PROGRESS    = path.join(DATA_DIR, 'scrape-progress.json');
const CACHE_URLS  = path.join(DATA_DIR, 'cache-urls.json');
const MASTER_LIST = path.join(DATA_DIR, 'anime-master-list.json');
const LOG_FILE    = '/tmp/scrape-anisub-bot.log';

function esc(s) { return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&'); }
function bar(pct, w = 16) {
  const f = Math.round((pct / 100) * w);
  return '█'.repeat(Math.max(0, f)) + '░'.repeat(Math.max(0, w - f));
}

const GH_OWNER = process.env.GITHUB_OWNER || 'JMStory-27';
const GH_REPO  = process.env.GITHUB_REPO  || 'Jumalia-Makruf';
const GH_TOKEN = process.env.GITHUB_TOKEN;

/**
 * Push cache-urls.json ke GitHub repository (branch main, folder data/)
 * supaya web app bisa auto-download cache dari raw.githubusercontent.com.
 */
async function pushCacheUrlsToGitHub(cacheUrls) {
  if (!GH_TOKEN) throw new Error('GITHUB_TOKEN tidak tersedia');

  const filePath = 'data/cache-urls.json';
  const content  = Buffer.from(JSON.stringify(cacheUrls, null, 2), 'utf8').toString('base64');
  const apiUrl   = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${filePath}`;
  const headers  = {
    Authorization:          `Bearer ${GH_TOKEN}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':         'application/json',
    'User-Agent':           'ScrapeAniSubBot',
  };

  // Ambil SHA file yang ada (diperlukan untuk update)
  let sha;
  try {
    const getRes = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(10_000) });
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }
  } catch {}

  const body = {
    message: `chore: update cache-urls.json [${new Date().toISOString()}]`,
    content,
    branch: 'main',
    ...(sha ? { sha } : {}),
  };

  const putRes = await fetch(apiUrl, {
    method:  'PUT',
    headers,
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(20_000),
  });

  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => '');
    throw new Error(`GitHub API ${putRes.status}: ${txt.slice(0, 200)}`);
  }
}

function readProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS, 'utf8')); } catch { return { done: {}, failed: [] }; }
}
function readCacheUrls() {
  try { return JSON.parse(fs.readFileSync(CACHE_URLS, 'utf8')); } catch { return null; }
}
function readMasterList() {
  try { return JSON.parse(fs.readFileSync(MASTER_LIST, 'utf8')); } catch { return {}; }
}

/** Generate laporan TXT kelengkapan data (versi lengkap) */
function generateReport() {
  const prog       = readProgress();
  const masterList = readMasterList();
  const done       = prog.done   || {};
  const failed     = prog.failed || [];
  const now        = new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' });
  const cacheUrls  = readCacheUrls();
  const allDone    = Object.values(done);

  // ── Statistik dasar ──
  const total        = Object.keys(done).length;
  const masterTotal  = Object.keys(masterList).length;
  const withAnilist  = allDone.filter(a => a.anilistId).length;
  const withPosterHD = allDone.filter(a => a.posterHD).length;
  const withPoster   = allDone.filter(a => a.poster || a.posterHD).length;
  const withBanner   = allDone.filter(a => a.banner).length;
  const withTrailer  = allDone.filter(a => a.trailer).length;
  const withChars    = allDone.filter(a => a.characters?.length > 0).length;
  const withStaff    = allDone.filter(a => a.staff?.length > 0).length;
  const withSynop    = allDone.filter(a => a.synopsis).length;
  const withGenre    = allDone.filter(a => a.genres?.length > 0).length;
  const withScore    = allDone.filter(a => a.score).length;
  const withNextEp   = allDone.filter(a => a.nextEpisode).length;

  // ── Sumber data ──
  const posterFromAnilist = allDone.filter(a => a.posterSource === 'anilist' || (a.posterHD && a.anilistId && !a.posterSource)).length;
  const posterFromJikan   = allDone.filter(a => a.posterSource === 'jikan').length;
  const synopsisFromAI    = allDone.filter(a => a.synopsisSource === 'ai').length;
  const synopsisFromAL    = allDone.filter(a => a.synopsisSource === 'anilist' || (a.synopsis && a.anilistId && !a.synopsisSource)).length;

  // ── Anime gagal (tidak ketemu AniList) ──
  const noAnilist = Object.entries(done).filter(([, d]) => !d.anilistId);
  // Dari yang gagal: berapa yang dapat poster fallback, sinopsis AI
  const failedWithPoster  = noAnilist.filter(([, d]) => d.posterHD).length;
  const failedWithSynop   = noAnilist.filter(([, d]) => d.synopsis).length;
  const failedNoData      = noAnilist.filter(([, d]) => !d.posterHD && !d.synopsis);

  // ── Lainnya ──
  const noBanner   = Object.entries(done).filter(([, d]) =>  d.anilistId && !d.banner);
  const noTrailer  = Object.entries(done).filter(([, d]) =>  d.anilistId && !d.trailer);
  const noChars    = Object.entries(done).filter(([, d]) =>  d.anilistId && !d.characters?.length);
  const noSynop    = Object.entries(done).filter(([, d]) => !d.synopsis);

  const lines = [];
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  LAPORAN SCRAPE ANISUB — ' + now);
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('Total anime diproses : ' + total + '/' + masterTotal);
  lines.push('Tidak ketemu AniList : ' + noAnilist.length + ' anime');
  if (cacheUrls) {
    lines.push('Cache di GitHub      : ' + cacheUrls.totalAnime + ' anime (upload: ' + new Date(cacheUrls.updatedAt).toLocaleDateString('id-ID') + ')');
    lines.push('Full cache URL       : ' + cacheUrls.fullCacheUrl);
    lines.push('Light list URL       : ' + cacheUrls.lightListUrl);
  }
  lines.push('');

  lines.push('── Kelengkapan Data ──────────────────────────────────────────');
  const pct = (n) => total > 0 ? ` (${((n/total)*100).toFixed(1)}%)` : '';
  lines.push('AniList match    : ' + withAnilist  + pct(withAnilist)  + ' anime');
  lines.push('Poster HD        : ' + withPosterHD + pct(withPosterHD) + ' anime');
  lines.push('Banner HD        : ' + withBanner   + pct(withBanner)   + ' anime');
  lines.push('Trailer/Video    : ' + withTrailer  + pct(withTrailer)  + ' anime');
  lines.push('Karakter + VA    : ' + withChars    + pct(withChars)    + ' anime');
  lines.push('Staf/Pengarang   : ' + withStaff    + pct(withStaff)    + ' anime');
  lines.push('Sinopsis         : ' + withSynop    + pct(withSynop)    + ' anime');
  lines.push('Genre            : ' + withGenre    + pct(withGenre)    + ' anime');
  lines.push('Score/Rating     : ' + withScore    + pct(withScore)    + ' anime');
  lines.push('Next Episode     : ' + withNextEp   + pct(withNextEp)   + ' anime');
  lines.push('');

  lines.push('── Sumber Data ───────────────────────────────────────────────');
  lines.push('Poster dari AniList  : ' + posterFromAnilist + ' anime');
  lines.push('Poster dari Jikan/MAL: ' + posterFromJikan   + ' anime (fallback)');
  lines.push('Sinopsis dari AniList: ' + synopsisFromAL    + ' anime');
  lines.push('Sinopsis dari AI     : ' + synopsisFromAI    + ' anime (Gemini/Groq fallback)');
  lines.push('');

  // ── Anime tidak ketemu di AniList ──
  lines.push('══ #1. TIDAK KETEMU DI ANILIST (' + noAnilist.length + ') ══');
  lines.push('(Tidak ada AniList match — banner, trailer, karakter, staf kosong)');
  lines.push('  → Dapat poster fallback : ' + failedWithPoster + ' / ' + noAnilist.length);
  lines.push('  → Dapat sinopsis AI     : ' + failedWithSynop  + ' / ' + noAnilist.length);
  lines.push('  → Masih kosong semua    : ' + failedNoData.length + ' anime');
  lines.push('');
  noAnilist.forEach(([id, d], i) => {
    const info    = masterList[id] || {};
    const title   = info.title || d.title || '?';
    const tags    = [];
    if (d.posterHD)   tags.push('✅poster:' + (d.posterSource || 'jikan'));
    else              tags.push('❌poster');
    if (d.synopsis)   tags.push('✅sinopsis:' + (d.synopsisSource || '?'));
    else              tags.push('❌sinopsis');
    lines.push((i + 1) + '. [' + id + '] ' + title);
    lines.push('   ↳ ' + tags.join(' | '));
  });
  lines.push('');

  // ── Masih tidak ada sinopsis (termasuk yang punya AniList tapi synopsis null) ──
  const stillNoSynop = noSynop.filter(([, d]) => d.anilistId); // punya AniList tapi tetap tidak ada synopsis
  if (stillNoSynop.length > 0) {
    lines.push('══ #2. PUNYA ANILIST TAPI SINOPSIS MASIH KOSONG (' + stillNoSynop.length + ') ══');
    lines.push('(AniList tidak ada deskripsi, dan AI generation gagal/tidak tersedia)');
    lines.push('');
    stillNoSynop.forEach(([id, d], i) => {
      const info = masterList[id] || {};
      lines.push((i + 1) + '. [' + id + '] ' + (info.title || d.title || '?'));
    });
    lines.push('');
  }

  lines.push('══ #3. PUNYA ANILIST TAPI TIDAK ADA BANNER (' + noBanner.length + ') ══');
  lines.push('(AniList belum upload banner untuk anime ini — tidak bisa diatasi)');
  lines.push('');
  noBanner.forEach(([id, d], i) => {
    const info = masterList[id] || {};
    lines.push((i + 1) + '. [' + id + '] ' + (info.title || d.title || '?'));
  });
  lines.push('');

  lines.push('══ #4. PUNYA ANILIST TAPI TIDAK ADA TRAILER (' + noTrailer.length + ') ══');
  lines.push('');
  noTrailer.forEach(([id, d], i) => {
    const info = masterList[id] || {};
    lines.push((i + 1) + '. [' + id + '] ' + (info.title || d.title || '?'));
  });
  lines.push('');

  lines.push('══ #5. PUNYA ANILIST TAPI TIDAK ADA KARAKTER/VA (' + noChars.length + ') ══');
  lines.push('');
  noChars.forEach(([id, d], i) => {
    const info = masterList[id] || {};
    lines.push((i + 1) + '. [' + id + '] ' + (info.title || d.title || '?'));
  });
  lines.push('');

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('CARA SCRAPE ULANG (dari Telegram):');
  lines.push('  /scrapeanisub        → resume + retry gagal + AI fallback');
  lines.push('  /scrapeanisub fresh  → mulai dari nol (semua anime diulang)');
  lines.push('  /scrapeanisub report → laporan saja tanpa scrape');
  lines.push('Generated: ' + new Date().toISOString());
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/** Kirim file TXT ke chat via Telegram Bot API */
async function sendTxtReport(bot, chatId, reportText, filename) {
  const buf = Buffer.from(reportText, 'utf8');
  await bot.sendDocument(chatId, buf, {
    caption: '📄 Laporan scrape AniSub',
  }, { filename, contentType: 'text/plain' });
}

/** Jalankan scraper sebagai child process dan pantau progressnya */
async function runScraper(bot, chatId, mode, statusMsgId) {
  // Tentukan script & args berdasarkan mode
  const isTurbo     = mode === 'turbo' || mode === 'turbo-full';
  const scriptPath  = isTurbo
    ? path.join(__dirname, '..', 'scripts', 'scrape-anime-turbo.js')
    : path.join(__dirname, '..', 'scripts', 'scrape-anime-data.js');

  let args = [];
  if (isTurbo && mode === 'turbo-full') args = ['--full'];
  else if (!isTurbo && mode !== 'fresh') args = ['--resume'];

  if (mode === 'fresh') {
    try { fs.unlinkSync(PROGRESS); }  catch {}
    try { fs.unlinkSync(CACHE_URLS); } catch {}
  }

  const edit = async (pct, step) => {
    try {
      await bot.editMessageText(
        `⚙️ <b>Scrape AniSub sedang berjalan...</b>\n\n` +
        `${bar(pct)} ${pct}%\n` +
        `<i>${step}</i>`,
        { chat_id: chatId, message_id: statusMsgId, parse_mode: 'HTML' }
      );
    } catch {}
  };

  return new Promise((resolve, reject) => {
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'w' });
    const child = spawn('node', [scriptPath, ...args], {
      cwd:      path.join(__dirname, '..'),
      env:      { ...process.env },
      stdio:    ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    let lastProgress = 0;
    let buffer = '';
    let remainingStart = -1;
    let remainingTotal = -1;
    let cacheUrlsJson  = null;

    const processLine = async (line) => {
      logStream.write(line + '\n');

      // Turbo scraper mencetak CACHE_URLS_JSON: di akhir — simpan untuk resolve
      if (line.startsWith('CACHE_URLS_JSON:')) {
        try { cacheUrlsJson = JSON.parse(line.slice('CACHE_URLS_JSON:'.length)); } catch {}
        return;
      }

      // Format turbo: "[45%] 90/200 | ✅ 80 AniList | ETA: ~3m"
      // Format lama:  "[28%] 516/1837 | ✅ 516 | ❌ 0 | ETA: ~6m"
      const matchPct = line.match(/\[(\d+)%\]\s+(\d+)\/(\d+)/);
      if (matchPct) {
        const globalDone  = parseInt(matchPct[2]);
        const globalTotal = parseInt(matchPct[3]);
        if (globalTotal > 0) {
          if (remainingStart < 0) remainingStart = globalDone - 1;
          if (remainingTotal < 0) remainingTotal = globalTotal - remainingStart;
          const relDone = globalDone - remainingStart;
          const relPct  = Math.round((relDone / Math.max(remainingTotal, 1)) * 100);
          if (relPct !== lastProgress) {
            lastProgress = relPct;
            const etaMatch = line.match(/ETA:\s*~(\d+)m/);
            const etaStr   = etaMatch ? ` — ETA ~${etaMatch[1]}m` : '';
            await edit(Math.min(relPct, 95), `${relDone}/${remainingTotal} anime diproses${etaStr} (${relPct}%)`);
          }
        }
      }

      // Step messages dari turbo scraper
      if (line.includes('Reuse dari cache'))        await edit(5,  line.replace(/\[.*?\]\s*/, ''));
      if (line.includes('Perlu di-scrape'))         await edit(8,  line.replace(/\[.*?\]\s*/, ''));
      if (line.includes('Parallel scrape'))         await edit(10, 'Parallel scrape dimulai...');
      if (line.includes('Merge & compile'))         await edit(96, 'Merge & compile output...');
      if (line.includes('Upload ke GitHub'))        await edit(97, 'Upload ke GitHub Release...');
      if (line.includes('Upload anisub-full'))      await edit(98, 'Upload full cache...');
      if (line.includes('Upload anisub-light'))     await edit(99, 'Upload light list...');
    };

    child.stdout.on('data', async (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) await processLine(line.trim());
    });
    child.stderr.on('data', (chunk) => logStream.write('[ERR] ' + chunk.toString()));
    child.on('close', (code) => {
      logStream.end();
      if (code === 0) resolve(cacheUrlsJson);
      else reject(new Error(`Scraper exit code ${code}`));
    });
    child.on('error', reject);
  });
}

async function handleScrapeCommand(bot, chatId, mode) {
  const prog = readProgress();
  const done = Object.keys(prog.done || {}).length;
  const fail = (prog.failed || []).length;
  const cacheUrls = readCacheUrls();

  // Mode: report only
  if (mode === 'report') {
    const report = generateReport();
    const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await sendTxtReport(bot, chatId, report, `anisub-scrape-report-${nowStr}.txt`);
    return;
  }

  // Perkiraan total untuk pesan intro
  let estTotal = 'semua anime terbaru';
  try {
    const ml = JSON.parse(fs.readFileSync(MASTER_LIST, 'utf8'));
    estTotal = Object.keys(ml).length.toLocaleString('id-ID');
  } catch {}

  // Hitung cache lama untuk turbo mode
  let cacheCount = 0;
  try {
    const fc = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'anisub-full-cache.json'), 'utf8'));
    cacheCount = (fc.anime || []).length;
  } catch {}

  let intro;
  if (mode === 'turbo') {
    intro = `⚡ <b>Scrape AniSub TURBO dimulai</b>\n` +
            `Cache lama: <b>${cacheCount.toLocaleString('id-ID')}</b> anime — akan di-reuse\n` +
            `Hanya anime baru yang di-scrape ke AniList\n` +
            `<i>Estimasi selesai: &lt; 10 menit 🚀</i>`;
  } else if (mode === 'turbo-full') {
    intro = `⚡ <b>Scrape AniSub TURBO FULL dimulai</b>\n` +
            `Parallel ${5} concurrent — fetch ulang semua ${estTotal} anime\n` +
            `<i>Estimasi selesai: 20-30 menit</i>`;
  } else if (mode === 'fresh') {
    intro = `🔄 <b>Scrape AniSub FRESH dimulai</b>\n` +
            `Progress lama dihapus — akan scrape <b>~${estTotal}</b> anime\n` +
            `<i>(mode lama/sequential — gunakan /scrapeanisub turbo untuk yang lebih cepat)</i>`;
  } else {
    intro = `🔄 <b>Scrape AniSub RESUME dimulai</b>\nSudah selesai: <b>${done}</b> | Gagal (akan di-retry): <b>${fail}</b>`;
  }

  if (mode === 'fresh') {
    try { fs.unlinkSync(PROGRESS); }  catch {}
    try { fs.unlinkSync(path.join(DATA_DIR, 'cache-urls.json')); } catch {}
  }

  const statusMsg = await bot.sendMessage(chatId,
    intro + '\n\n' + bar(0) + ' 0%\n<i>Memulai scraper...</i>',
    { parse_mode: 'HTML' }
  );

  try {
    const cacheUrlsResult = await runScraper(bot, chatId, mode, statusMsg.message_id);

    // Selesai — baca hasil dari progress file
    const prog2      = readProgress();
    const done2      = Object.keys(prog2.done || {}).length;
    const fail2      = (prog2.failed || []).length;
    const cacheUrls2 = cacheUrlsResult || readCacheUrls();

    const vals2       = Object.values(prog2.done || {});
    const withBanner  = vals2.filter(a => a.banner).length;
    const withTrailer = vals2.filter(a => a.trailer).length;
    const withChars   = vals2.filter(a => a.characters?.length > 0).length;

    let realTotal = done2;
    try {
      const ml = JSON.parse(fs.readFileSync(MASTER_LIST, 'utf8'));
      realTotal = Object.keys(ml).length;
    } catch {}

    const turboTag = (mode === 'turbo' || mode === 'turbo-full') ? '⚡ ' : '';

    await bot.editMessageText(
      `✅ <b>${turboTag}Scrape AniSub Selesai!</b>\n\n` +
      `${bar(100)} 100%\n\n` +
      `📊 <b>Hasil:</b>\n` +
      `• Total selesai : <b>${done2.toLocaleString('id-ID')}/${realTotal.toLocaleString('id-ID')}</b>\n` +
      `• Gagal         : <b>${fail2}</b>\n` +
      `• Banner HD     : <b>${withBanner.toLocaleString('id-ID')}</b>\n` +
      `• Trailer       : <b>${withTrailer.toLocaleString('id-ID')}</b>\n` +
      `• Karakter + VA : <b>${withChars.toLocaleString('id-ID')}</b>\n` +
      (cacheUrls2
        ? `\n📦 Cache di GitHub:\n<a href="${cacheUrls2.fullCacheUrl}">anisub-full-cache.json</a> | <a href="${cacheUrls2.lightListUrl}">light-list</a>`
        : '') +
      `\n\n<i>Laporan lengkap dikirim di bawah...</i>`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML', disable_web_page_preview: true }
    );

    // Push cache-urls.json ke GitHub raw data
    if (cacheUrls2) {
      try {
        await pushCacheUrlsToGitHub(cacheUrls2);
        await bot.sendMessage(chatId, '☁️ cache-urls.json berhasil di-push ke GitHub raw data.');
      } catch (e) {
        await bot.sendMessage(chatId, `⚠️ Push cache-urls.json gagal: ${e.message}`);
      }
    }

    // Kirim laporan TXT
    const report = generateReport();
    const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await sendTxtReport(bot, chatId, report, `anisub-scrape-report-${nowStr}.txt`);

  } catch (err) {
    console.error('[scrapeanisub]', err);
    try {
      await bot.editMessageText(
        `❌ <b>Scrape gagal</b>\n\n<code>${String(err.message).slice(0, 300)}</code>`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
      );
    } catch {}
  }
}

function registerScrapeAniSubCommand(bot, ownerId) {
  bot.onText(/^\/scrapeanisub(?:\s+(.+))?/i, async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from ? String(msg.from.id) : null;
    if (ownerId && fromId !== ownerId) {
      return bot.sendMessage(chatId, '🔒 Command ini khusus owner.');
    }

    const parts = (msg.text || '').trim().split(/\s+/).slice(1).map(s => s.toLowerCase());
    const arg1  = parts[0] || '';
    const arg2  = parts[1] || '';

    let mode;
    if      (arg1 === 'turbo' && arg2 === 'full') mode = 'turbo-full';
    else if (arg1 === 'turbo')                    mode = 'turbo';
    else if (arg1 === 'fresh')                    mode = 'fresh';
    else if (arg1 === 'report')                   mode = 'report';
    else                                          mode = 'resume';

    await handleScrapeCommand(bot, chatId, mode);
  });
}

module.exports = { registerScrapeAniSubCommand, generateReport, handleScrapeCommand };
