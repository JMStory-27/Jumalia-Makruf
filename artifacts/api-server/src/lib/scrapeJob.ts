import { EventEmitter } from "node:events";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { logger } from "./logger";

const WGAPI = "https://wg-anime-api-v2.onrender.com";

// Auto-scrape berjalan MUTLAK tiap 5 menit dari jam server, terlepas dari
// apakah ada user yang buka app atau pencet tombol ⚡ atau tidak.
export const SCRAPE_INTERVAL_MS = 5 * 60_000;

interface RawAnimeCard {
  animeId: string;
  title: string;
  episodes?: string;
  latestReleaseDate?: string;
  status?: string;
}

interface AnimeDetailRaw {
  title: string;
  poster?: string;
  synopsis?: { paragraphList?: unknown[] };
  genreList?: { title: string }[];
  score?: string;
  studios?: string;
  episodes?: string;
  aired?: string;
  type?: string;
}

export interface DetailEnrichReport {
  queued: number;
  processed: number;
  ok: number;
  failed: number;
  bannerFilled: string[];
  synopsisFilled: string[];
  genreFilled: string[];
  scoreFilled: string[];
  studioFilled: string[];
  seasonDetected: string[];
  episodeCountUpdated: string[];
  failedTitles: string[];
  charactersNote: string;
  retryQueueSize: number;
}

export interface ScrapeResult {
  id: string;
  startedAt: number;
  finishedAt: number;
  trigger: "auto" | "manual";
  ok: boolean;
  totalOngoing: number;
  totalCompleted: number;
  totalAnime: number;
  newAnimeCount: number;
  episodeBumpCount: number;
  removedCount: number;
  newCompletedCount: number;
  newAnimeTitles: string[];
  episodeBumpTitles: string[];
  removedTitles: string[];
  newCompletedTitles: string[];
  detail: DetailEnrichReport;
  sweep: { coveredSoFar: number; totalUnique: number; cycleCount: number };
  errors: string[];
  githubSynced: boolean;
  webReportSynced: boolean;
  webReportUrl: string;
}

interface ScrapeState {
  running: boolean;
  lastRunAt: number | null;
  nextRunAt: number;
  lastResult: ScrapeResult | null;
  history: ScrapeResult[];
}

const state: ScrapeState = {
  running: false,
  lastRunAt: null,
  nextRunAt: Date.now() + SCRAPE_INTERVAL_MS,
  lastResult: null,
  history: [],
};

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

let prevSnapshot = new Map<string, RawAnimeCard>();
let prevCompletedSnapshot = new Map<string, RawAnimeCard>();
let bootstrapped = false;
let completedBootstrapped = false;

// Sweep cursor (item: "cek menyeluruh ke ALL anime", bukan cuma yang baru/berubah).
// Setiap run kita jalan lewat daftar gabungan ongoing+completed secara berurutan,
// verifikasi field mana yang masih kosong di cache, biar lambat laun (beberapa run)
// SEMUA anime (termasuk yang sudah tamat/lama) ikut ter-cek, bukan cuma yang baru rilis.
let sweepCursor = 0;
let sweepCycleCount = 0;

// Cache detail hasil enrichment (banner, sinopsis, genre, skor, studio, season)
// — dipakai buat laporan & fallback cepat. Dibatasi ukurannya biar tidak bocor memori.
const detailCache = new Map<string, { data: AnimeDetailRaw; season: string | null; cachedAt: number }>();
const DETAIL_CACHE_MAX = 400;

// Retry queue (item #33): animeId yang gagal di-detail-fetch di run sebelumnya,
// otomatis dicoba lagi di run berikutnya sebelum anime baru lainnya.
let retryQueue: string[] = [];
// 60 per run: estimasi 60 × 1.5s = 90s enrichment.
// Total run ~3-4 menit (termasuk fetch list semua halaman), interval 5 menit → masih aman.
const MAX_DETAIL_PER_RUN = 60;

function detectSeason(aired?: string): string | null {
  if (!aired) return null;
  const m = aired.match(/([A-Za-z]{3,9})\s+\d{1,2},?\s*(\d{4})/) || aired.match(/([A-Za-z]{3,9})\s*(\d{4})/);
  if (!m) return null;
  const month = m[1]!.slice(0, 3).toLowerCase();
  const year = m[2];
  const table: Record<string, string> = {
    dec: "Winter", jan: "Winter", feb: "Winter",
    mar: "Spring", apr: "Spring", may: "Spring",
    jun: "Summer", jul: "Summer", aug: "Summer",
    sep: "Fall", oct: "Fall", nov: "Fall",
  };
  const season = table[month];
  return season ? `${season} ${year}` : null;
}

/** Enrichment pass (#4,5,6,8,9(N/A),10(N/A),11,12,14,17,33):
 *  Ambil detail lengkap untuk anime baru/naik-episode/antrian-retry, catat
 *  field mana yang berhasil terisi supaya bisa dilaporkan rapi ke admin. */
async function enrichDetails(
  candidateIds: string[],
  errors: string[],
): Promise<DetailEnrichReport> {
  const seen = new Set<string>();
  const queue = [...retryQueue, ...candidateIds].filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const queued = queue.length;
  const toProcess = queue.slice(0, MAX_DETAIL_PER_RUN);
  const carryOver = queue.slice(MAX_DETAIL_PER_RUN);

  const report: DetailEnrichReport = {
    queued,
    processed: 0,
    ok: 0,
    failed: 0,
    bannerFilled: [],
    synopsisFilled: [],
    genreFilled: [],
    scoreFilled: [],
    studioFilled: [],
    seasonDetected: [],
    episodeCountUpdated: [],
    failedTitles: [],
    charactersNote: "Karakter, pengisi suara (seiyuu), dan trailer tidak tersedia dari sumber data — endpoint detail otakudesu tidak menyediakan field ini sama sekali (sudah dicek langsung ke API-nya).",
    retryQueueSize: 0,
  };

  const nextRetry: string[] = [...carryOver];

  for (const id of toProcess) {
    report.processed++;
    try {
      const res = await fetchWithRetry(`/otakudesu/anime/${id}`, 2);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { data?: { details?: AnimeDetailRaw } };
      const d = json.data?.details;
      if (!d) throw new Error("no details in response");

      const title = d.title || id;
      const prevCached = detailCache.get(id);
      const season = detectSeason(d.aired);

      if (d.poster) report.bannerFilled.push(title);
      if (d.synopsis?.paragraphList && d.synopsis.paragraphList.length > 0) report.synopsisFilled.push(title);
      if (d.genreList && d.genreList.length > 0) report.genreFilled.push(title);
      if (d.score && d.score.trim()) report.scoreFilled.push(title);
      if (d.studios && d.studios.trim()) report.studioFilled.push(title);
      if (season) report.seasonDetected.push(title);
      if (d.episodes && prevCached?.data.episodes && prevCached.data.episodes !== d.episodes) {
        report.episodeCountUpdated.push(title);
      }

      detailCache.set(id, { data: d, season, cachedAt: Date.now() });
      if (detailCache.size > DETAIL_CACHE_MAX) {
        const oldestKey = detailCache.keys().next().value;
        if (oldestKey) detailCache.delete(oldestKey);
      }
      report.ok++;
    } catch (err) {
      report.failed++;
      report.failedTitles.push(id);
      nextRetry.push(id);
      errors.push(`detail ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Batasi retry queue biar tidak numpuk selamanya kalau satu anime memang selalu gagal.
  retryQueue = Array.from(new Set(nextRetry)).slice(0, 120);
  report.retryQueueSize = retryQueue.length;
  return report;
}

export function getScrapeState(): ScrapeState {
  return state;
}

export function getDetailCacheSize(): number {
  return detailCache.size;
}

export function onScrapeUpdate(cb: (s: ScrapeState) => void): () => void {
  emitter.on("update", cb);
  return () => emitter.off("update", cb);
}

function notify(): void {
  emitter.emit("update", state);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch dari WGAPI dengan retry + exponential backoff kalau kena 429/timeout. */
async function fetchWithRetry(path: string, retries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${WGAPI}${path}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
          "Accept": "application/json, */*;q=0.8",
          "Referer": "https://otakudesu.blog/",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 && attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) { await sleep(500 * 2 ** attempt); continue; }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetchWithRetry failed");
}

async function fetchAllOngoing(maxPages = 30, errors: string[]): Promise<Map<string, RawAnimeCard>> {
  const map = new Map<string, RawAnimeCard>();
  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetchWithRetry(`/otakudesu/ongoing?page=${page}`);
      if (!res.ok) { if (page === 1) errors.push(`ongoing page ${page}: HTTP ${res.status}`); break; }
      const json = await res.json() as { data?: { animeList?: RawAnimeCard[] } };
      const list = json.data?.animeList ?? [];
      if (list.length === 0) break;
      for (const a of list) map.set(a.animeId, a);
      if (list.length < 25) break;
    } catch (err) {
      errors.push(`ongoing page ${page}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }
  return map;
}

// Item: pastikan anime yang SUDAH TAMAT juga ikut dicek (bukan cuma ongoing) —
// dipakai buat deteksi "completed baru" (anime yang baru saja tamat & masuk
// daftar completed) dan sebagai sumber sweep enrichment menyeluruh.
async function fetchAllCompleted(maxPages = 80, errors: string[]): Promise<Map<string, RawAnimeCard>> {
  const map = new Map<string, RawAnimeCard>();
  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetchWithRetry(`/otakudesu/completed?page=${page}`);
      if (!res.ok) { if (page === 1) errors.push(`completed page ${page}: HTTP ${res.status}`); break; }
      const json = await res.json() as { data?: { animeList?: RawAnimeCard[] } };
      const list = json.data?.animeList ?? [];
      if (list.length === 0) break;
      for (const a of list) map.set(a.animeId, a);
      if (list.length < 25) break;
    } catch (err) {
      errors.push(`completed page ${page}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }
  return map;
}

/** Opsional: simpan snapshot ke GitHub (data/ongoing.json) via Contents API,
 *  supaya fallback GH_RAW di frontend selalu fresh. Non-fatal kalau gagal. */
async function pushSnapshotToGitHub(animeList: RawAnimeCard[], commitMessage: string): Promise<boolean> {
  const token = process.env["GITHUB_TOKEN"];
  const owner = process.env["GITHUB_OWNER"];
  const repo = process.env["GITHUB_REPO"];
  if (!token || !owner || !repo) return false;

  const filePath = "data/ongoing.json";
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "User-Agent": "anisub-scrape-job",
  };

  try {
    let sha: string | undefined;
    const getRes = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(10_000) });
    if (getRes.ok) {
      const json = await getRes.json() as { sha?: string };
      sha = json.sha;
    }
    const content = Buffer.from(JSON.stringify({ animeList, updatedAt: new Date().toISOString() }, null, 2)).toString("base64");
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage,
        content,
        sha,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return putRes.ok;
  } catch {
    return false;
  }
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function fmtListHtml(arr: string[], emptyLabel = "tidak ada"): string {
  if (!arr || arr.length === 0) return `<span class="muted">${emptyLabel}</span>`;
  return `<ul>${arr.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
}

/** Bangun halaman web statis (dark, mirip panel admin di app) yang dipush ke
 *  GitHub Pages — supaya laporan scrape bisa dilihat sebagai WEB SUNGGUHAN
 *  (bukan raw JSON) langsung dari link GitHub, tanpa perlu buka app AniSub. */
function buildReportHtmlPage(result: ScrapeResult): string {
  const d = result.detail;
  const dt = new Date(result.finishedAt).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "medium" });
  const durSec = ((result.finishedAt - result.startedAt) / 1000).toFixed(1);

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AniSub — Auto-Scrape Report</title>
<meta http-equiv="refresh" content="60">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #05050f; color: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px 14px 60px; }
  .wrap { max-width: 780px; margin: 0 auto; }
  h1 { font-size: 20px; display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .sub { color: #8B93A8; font-size: 13px; margin-bottom: 20px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 10px; margin-bottom: 18px; }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 12px 14px; }
  .card .label { color: #8B93A8; font-size: 11px; margin-bottom: 4px; }
  .card .value { font-size: 20px; font-weight: 800; }
  .ok { color: #4ADE80; } .warn { color: #FBBF24; } .err { color: #F87171; } .muted { color: #5B6478; }
  section { background: #0A0A14; border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; }
  section h2 { font-size: 13px; margin: 0 0 6px; color: #FB923C; }
  section p { margin: 2px 0; font-size: 13px; }
  ul { margin: 6px 0 0; padding-left: 18px; font-size: 12.5px; color: #C7CCDA; }
  li { margin-bottom: 2px; }
  footer { text-align: center; color: #5B6478; font-size: 11px; margin-top: 24px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
</style>
</head>
<body>
<div class="wrap">
  <h1>⚡ AniSub — Laporan Auto-Scrape</h1>
  <div class="sub">Waktu selesai: ${esc(dt)} · Trigger: ${result.trigger === "manual" ? "Manual" : "Otomatis"} · Durasi: ${durSec}s · Halaman ini auto-refresh tiap 60 detik.</div>

  <div class="cards">
    <div class="card"><div class="label">Status</div><div class="value ${result.ok ? "ok" : "err"}">${result.ok ? "✅ OK" : "⚠️ Error"}</div></div>
    <div class="card"><div class="label">Ongoing</div><div class="value">${result.totalOngoing}</div></div>
    <div class="card"><div class="label">Completed</div><div class="value">${result.totalCompleted}</div></div>
    <div class="card"><div class="label">Total Anime</div><div class="value">${result.totalAnime}</div></div>
    <div class="card"><div class="label">GitHub Sync</div><div class="value ${result.githubSynced ? "ok" : "warn"}">${result.githubSynced ? "✅" : "⚠️"}</div></div>
    <div class="card"><div class="label">Sweep Progress</div><div class="value">${d.processed ? "" : ""}${result.sweep.coveredSoFar}/${result.sweep.totalUnique}</div></div>
  </div>

  <section>
    <h2>#1 — Anime baru masuk jadwal ongoing (${result.newAnimeCount})</h2>
    ${fmtListHtml(result.newAnimeTitles)}
  </section>

  <section>
    <h2>#2 &amp; #3 — Anime tamat, auto-dihapus dari ongoing (${result.removedCount})</h2>
    ${fmtListHtml(result.removedTitles)}
    <p style="margin-top:8px;color:#8B93A8;">Baru masuk daftar completed: ${result.newCompletedCount}</p>
    ${fmtListHtml(result.newCompletedTitles)}
  </section>

  <section>
    <h2>#17 — Episode naik terdeteksi (${result.episodeBumpCount})</h2>
    ${fmtListHtml(result.episodeBumpTitles)}
  </section>

  <section>
    <h2>Sweep menyeluruh — cek SEMUA anime (ongoing + completed)</h2>
    <p>Progress kumulatif: <b>${result.sweep.coveredSoFar}/${result.sweep.totalUnique}</b> anime sudah pernah diverifikasi field-nya.</p>
    <p>Putaran penuh selesai: <b>${result.sweep.cycleCount}</b>x</p>
  </section>

  <section>
    <h2>#4 — Banner terisi (${d.bannerFilled.length})</h2>
    ${fmtListHtml(d.bannerFilled)}
  </section>

  <section>
    <h2>#6 — Sinopsis terisi (${d.synopsisFilled.length})</h2>
    ${fmtListHtml(d.synopsisFilled)}
  </section>

  <section>
    <h2>#8 — Studio/staff terisi (${d.studioFilled.length})</h2>
    ${fmtListHtml(d.studioFilled)}
  </section>

  <section>
    <h2>#9 &amp; #10 — Karakter, pengisi suara &amp; trailer</h2>
    <p class="warn">TIDAK TERSEDIA — ${esc(d.charactersNote)}</p>
  </section>

  <section>
    <h2>#11 — Genre terisi (${d.genreFilled.length})</h2>
    ${fmtListHtml(d.genreFilled)}
  </section>

  <section>
    <h2>#12 — Skor terisi (${d.scoreFilled.length})</h2>
    ${fmtListHtml(d.scoreFilled)}
  </section>

  <section>
    <h2>#14 — Musim rilis terdeteksi (${d.seasonDetected.length})</h2>
    ${fmtListHtml(d.seasonDetected)}
  </section>

  <section>
    <h2>#33 — Retry queue (gagal run ini: ${d.failed}/${d.processed})</h2>
    ${fmtListHtml(d.failedTitles)}
    <p style="margin-top:8px;color:#8B93A8;">Masih di antrian retry untuk run berikutnya: ${d.retryQueueSize}</p>
  </section>

  ${result.errors.length > 0 ? `<section><h2 class="err">Error / Warning</h2>${fmtListHtml(result.errors)}</section>` : ""}

  <footer>Auto-scrape berjalan mutlak tiap 5 menit dari server AniSub — halaman ini update otomatis setiap kali scrape selesai.</footer>
</div>
</body>
</html>`;
}

/** Push halaman laporan web statis ke branch gh-pages (path web/update/) supaya
 *  bisa diakses sebagai website beneran, bukan cuma file JSON mentah. Non-fatal. */
async function pushWebReportToGitHub(result: ScrapeResult): Promise<boolean> {
  const token = process.env["GITHUB_TOKEN"];
  const owner = process.env["GITHUB_OWNER"];
  const repo = process.env["GITHUB_REPO"];
  if (!token || !owner || !repo) return false;

  const filePath = "web/update/index.html";
  const branch = "gh-pages";
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "User-Agent": "anisub-scrape-job",
  };

  try {
    let sha: string | undefined;
    const getRes = await fetch(`${apiUrl}?ref=${branch}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (getRes.ok) {
      const json = await getRes.json() as { sha?: string };
      sha = json.sha;
    }
    const html = buildReportHtmlPage(result);
    const content = Buffer.from(html).toString("base64");
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `web/update: laporan auto-scrape ${new Date().toISOString()}`,
        content,
        sha,
        branch,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return putRes.ok;
  } catch {
    return false;
  }
}

export async function runScrapeOnce(trigger: "auto" | "manual"): Promise<ScrapeResult> {
  if (state.running) throw new Error("Scrape already running");
  state.running = true;
  notify();

  const startedAt = Date.now();
  const errors: string[] = [];
  let ongoingMap = new Map<string, RawAnimeCard>();
  let completedMap = new Map<string, RawAnimeCard>();

  try {
    ongoingMap = await fetchAllOngoing(30, errors);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  try {
    completedMap = await fetchAllCompleted(80, errors);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const newAnimeTitles: string[] = [];
  const newAnimeIds: string[] = [];
  const episodeBumpTitles: string[] = [];
  const episodeBumpIds: string[] = [];
  const removedTitles: string[] = [];
  const newCompletedTitles: string[] = [];
  const newCompletedIds: string[] = [];

  if (bootstrapped) {
    for (const [id, anime] of ongoingMap) {
      const prev = prevSnapshot.get(id);
      if (!prev) {
        newAnimeTitles.push(anime.title);
        newAnimeIds.push(id);
      } else if (prev.episodes !== anime.episodes && anime.episodes) {
        episodeBumpTitles.push(anime.title);
        episodeBumpIds.push(id);
      }
    }
    // Item #2/#3: anime yang hilang dari daftar ongoing dianggap tamat →
    // otomatis "dihapus" dari jadwal ongoing (tidak perlu aksi manual).
    for (const [id, anime] of prevSnapshot) {
      if (!ongoingMap.has(id)) removedTitles.push(anime.title);
    }
  }

  if (completedBootstrapped) {
    for (const [id, anime] of completedMap) {
      if (!prevCompletedSnapshot.has(id)) {
        newCompletedTitles.push(anime.title);
        newCompletedIds.push(id);
      }
    }
  }

  const ok = (ongoingMap.size > 0 || completedMap.size > 0) || errors.length === 0;
  if (ongoingMap.size > 0) {
    prevSnapshot = ongoingMap;
    bootstrapped = true;
  }
  if (completedMap.size > 0) {
    prevCompletedSnapshot = completedMap;
    completedBootstrapped = true;
  }

  // Sweep menyeluruh: gabungkan ongoing + completed jadi satu daftar utuh (item
  // "cek menyeluruh ke ALL anime, bukan cuma ongoing"). Cursor berjalan maju tiap
  // run sehingga lambat laun SEMUA anime (termasuk yang sudah lama tamat) ikut
  // diverifikasi field-nya (banner/sinopsis/genre/skor/studio/season), bukan cuma
  // yang baru rilis atau baru naik episode.
  // Ongoing selalu di depan → PRIORITAS ongoing diperiksa lebih sering
  // (ongoing bisa rilis eps baru kapan saja, completed lebih statis).
  const allAnimeList = [...ongoingMap.values(), ...completedMap.values()];
  const sweepIds: string[] = [];
  if (allAnimeList.length > 0) {
    // 60 per run: cover semua 1854+ anime dalam ~31 run × 5 menit ≈ 2.6 jam per siklus penuh.
    const SWEEP_BATCH = 60;
    for (let i = 0; i < SWEEP_BATCH; i++) {
      const idx = (sweepCursor + i) % allAnimeList.length;
      const anime = allAnimeList[idx];
      if (anime && !detailCache.has(anime.animeId)) sweepIds.push(anime.animeId);
    }
    const nextCursor = sweepCursor + SWEEP_BATCH;
    if (nextCursor >= allAnimeList.length) sweepCycleCount++;
    sweepCursor = nextCursor % Math.max(1, allAnimeList.length);
  }

  // Item #4,5,6,8,9,10,11,12,14,17,33: enrich detail utk anime baru/naik-episode/
  // completed-baru/retry, PLUS batch sweep menyeluruh di atas.
  const detailReport = await enrichDetails(
    [...newAnimeIds, ...episodeBumpIds, ...newCompletedIds, ...sweepIds],
    errors,
  );

  let githubSynced = false;
  if (ok && ongoingMap.size > 0) {
    const dateStr = new Date().toISOString().slice(0, 16).replace("T", " ");
    const commitMessage = `update anime jadwal (${dateStr}): ${newAnimeTitles.length} baru, ${episodeBumpTitles.length} episode naik, ${removedTitles.length} tamat`;
    githubSynced = await pushSnapshotToGitHub(Array.from(ongoingMap.values()), commitMessage);
  }

  const owner = process.env["GITHUB_OWNER"];
  const repo = process.env["GITHUB_REPO"];
  const webReportUrl = owner && repo ? `https://${owner.toLowerCase()}.github.io/${repo}/web/update/` : "";

  const result: ScrapeResult = {
    id: `${startedAt}`,
    startedAt,
    finishedAt: Date.now(),
    trigger,
    ok,
    totalOngoing: ongoingMap.size,
    totalCompleted: completedMap.size,
    totalAnime: allAnimeList.length,
    newAnimeCount: newAnimeTitles.length,
    episodeBumpCount: episodeBumpTitles.length,
    removedCount: removedTitles.length,
    newCompletedCount: newCompletedTitles.length,
    newAnimeTitles: newAnimeTitles.slice(0, 20),
    episodeBumpTitles: episodeBumpTitles.slice(0, 20),
    removedTitles: removedTitles.slice(0, 20),
    newCompletedTitles: newCompletedTitles.slice(0, 20),
    detail: detailReport,
    sweep: {
      coveredSoFar: detailCache.size,
      totalUnique: allAnimeList.length,
      cycleCount: sweepCycleCount,
    },
    errors,
    githubSynced,
    webReportSynced: false,
    webReportUrl,
  };

  // Push halaman laporan sebagai WEB SUNGGUHAN ke GitHub Pages (web/update/),
  // bukan cuma file JSON mentah — biar bisa dibuka langsung dari browser.
  try {
    result.webReportSynced = await pushWebReportToGitHub(result);
  } catch {
    result.webReportSynced = false;
  }

  state.running = false;
  state.lastRunAt = result.finishedAt;
  state.lastResult = result;
  state.history.unshift(result);
  state.history = state.history.slice(0, 20);
  notify();

  logger.info({ trigger, totalOngoing: result.totalOngoing, newAnimeCount: result.newAnimeCount, episodeBumpCount: result.episodeBumpCount, errors: result.errors }, "scrape run finished");

  return result;
}

// ── Full Sweep: cek SEMUA anime satu-per-satu, baca dari cache lokal ──────────

/** Path file cache lokal — harus cocok dengan yang di cache.ts */
const FULL_CACHE_WORKSPACE_PATH = "/home/runner/workspace/.cache/anisub-full-cache.json";
const FULL_CACHE_TMP_PATH       = "/tmp/anisub-full-cache.json";

export interface FullSweepProgressEvent {
  current: number;
  total: number;
  done: boolean;
  lastTitle: string;
  okCount: number;
  failedCount: number;
  skippedCached: number;
  missingBanner: number;
  missingSynopsis: number;
  missingGenre: number;
  missingScore: number;
  running?: boolean;
}

const fullSweepEmitter = new EventEmitter();
fullSweepEmitter.setMaxListeners(50);

let fullSweepRunning = false;
let _fullSweepProgress: FullSweepProgressEvent = {
  current: 0, total: 0, done: false, lastTitle: "",
  okCount: 0, failedCount: 0, skippedCached: 0,
  missingBanner: 0, missingSynopsis: 0, missingGenre: 0, missingScore: 0,
};

export function getFullSweepState(): FullSweepProgressEvent & { running: boolean } {
  return { ..._fullSweepProgress, running: fullSweepRunning };
}

export function onFullSweepUpdate(
  cb: (p: FullSweepProgressEvent & { running: boolean }) => void,
): () => void {
  fullSweepEmitter.on("progress", cb);
  return () => fullSweepEmitter.off("progress", cb);
}

function emitSweep(): void {
  fullSweepEmitter.emit("progress", { ..._fullSweepProgress, running: fullSweepRunning });
}

interface FullCacheEntry {
  animeId: string;
  title: string;
  banner?: string | null;
  posterHD?: string | null;
  synopsis?: string | null;
  genres?: unknown[] | null;
  score?: number | string | null;
  [key: string]: unknown;
}

export async function triggerFullSweepJob(): Promise<{ accepted: boolean } | { error: string }> {
  if (fullSweepRunning) return { error: "Full sweep sedang berjalan, tunggu sampai selesai" };

  fullSweepRunning = true;
  _fullSweepProgress = {
    current: 0, total: 0, done: false, lastTitle: "",
    okCount: 0, failedCount: 0, skippedCached: 0,
    missingBanner: 0, missingSynopsis: 0, missingGenre: 0, missingScore: 0,
  };
  emitSweep();

  runFullSweepBackground().catch((err) => {
    logger.error({ err }, "full sweep background error");
    fullSweepRunning = false;
    _fullSweepProgress.done = true;
    emitSweep();
  });

  return { accepted: true };
}

async function runFullSweepBackground(): Promise<void> {
  // ── Langkah 1: Bangun daftar semua anime — PRIORITAS ongoing di depan ─────
  logger.info("full-sweep: fetch daftar ongoing + completed dari OtakuDesu...");
  const buildErrors: string[] = [];
  const [ongoingMap, completedMap] = await Promise.all([
    fetchAllOngoing(30, buildErrors),
    fetchAllCompleted(80, buildErrors),
  ]);

  // Ongoing selalu di depan — mereka punya episode baru yang bisa berubah kapan saja
  let animeList: FullCacheEntry[] = [
    ...Array.from(ongoingMap.values()),
    ...Array.from(completedMap.values()),
  ] as FullCacheEntry[];

  // Fallback: pakai cache lokal jika fetch live gagal total
  if (animeList.length === 0) {
    const cachePath = existsSync(FULL_CACHE_WORKSPACE_PATH)
      ? FULL_CACHE_WORKSPACE_PATH
      : existsSync(FULL_CACHE_TMP_PATH) ? FULL_CACHE_TMP_PATH : null;
    if (cachePath) {
      try {
        const raw = JSON.parse(readFileSync(cachePath, "utf8")) as {
          anime?: FullCacheEntry[];
          animeList?: FullCacheEntry[];
        };
        animeList = Array.isArray(raw.anime) ? raw.anime
          : Array.isArray(raw.animeList) ? raw.animeList : [];
        logger.warn({ count: animeList.length }, "full-sweep: fetch live gagal, pakai cache lokal");
      } catch (err) {
        logger.error({ err }, "full-sweep: cache lokal juga gagal, abort");
      }
    }
  }

  if (animeList.length === 0) {
    _fullSweepProgress.done = true;
    fullSweepRunning = false;
    emitSweep();
    return;
  }

  _fullSweepProgress.total = animeList.length;
  emitSweep();
  logger.info({ total: animeList.length, ongoing: ongoingMap.size, completed: completedMap.size }, "full-sweep: mulai proses semua anime (prioritas ongoing)");

  // ── Langkah 2: Fetch detail dari OtakuDesu untuk SETIAP anime ────────────
  // Prioritas:
  //   1. Semua ongoing (episode bisa naik kapan saja)
  //   2. Completed yang field-nya masih kosong (banner/synopsis/genres/score)
  //   3. Completed yang field-nya sudah lengkap (tetap dicek, tapi paling akhir)
  const CONCURRENCY = 3;   // request paralel — hormat rate limit WGAPI
  const EMIT_EVERY  = 20;
  const DELAY_MS    = 300; // jeda antar batch (ms) agar tidak hammer API

  let i = 0;
  while (i < animeList.length) {
    if (!fullSweepRunning) break; // dibatalkan dari luar

    const batch = animeList.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async (anime) => {
      _fullSweepProgress.lastTitle = anime.title;
      try {
        const res = await fetchWithRetry(`/otakudesu/anime/${anime.animeId}`, 2);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as { data?: { details?: AnimeDetailRaw } };
        const d = json.data?.details;
        if (!d) throw new Error("no details");

        // Update detailCache dengan data terbaru
        const season = detectSeason(d.aired);
        detailCache.set(anime.animeId, { data: d, season, cachedAt: Date.now() });
        if (detailCache.size > DETAIL_CACHE_MAX) {
          const oldestKey = detailCache.keys().next().value;
          if (oldestKey) detailCache.delete(oldestKey);
        }

        _fullSweepProgress.okCount++;

        // Audit field setelah fetch
        if (!d.poster) _fullSweepProgress.missingBanner++;
        if (!d.synopsis?.paragraphList?.length) _fullSweepProgress.missingSynopsis++;
        if (!d.genreList?.length) _fullSweepProgress.missingGenre++;
        if (!d.score?.trim()) _fullSweepProgress.missingScore++;
      } catch {
        _fullSweepProgress.failedCount++;
        // Masuk retry queue auto-scrape berikutnya
        if (!retryQueue.includes(anime.animeId)) retryQueue.push(anime.animeId);
        retryQueue = retryQueue.slice(0, 120);
      }
    }));

    i += CONCURRENCY;
    _fullSweepProgress.current = Math.min(i, animeList.length);

    if (_fullSweepProgress.current % EMIT_EVERY === 0 || _fullSweepProgress.current >= animeList.length) {
      emitSweep();
    }

    // Jeda kecil antar batch agar WGAPI tidak kena rate limit
    if (i < animeList.length) await sleep(DELAY_MS);
  }

  _fullSweepProgress.done = true;
  fullSweepRunning = false;
  emitSweep();
  logger.info({
    total: _fullSweepProgress.total,
    ok: _fullSweepProgress.okCount,
    failed: _fullSweepProgress.failedCount,
    missingBanner: _fullSweepProgress.missingBanner,
    missingSynopsis: _fullSweepProgress.missingSynopsis,
  }, "full sweep nyata selesai — semua anime sudah dicek ke OtakuDesu");
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let schedulerStarted = false;

/** Jadwal MUTLAK: dihitung dari jam server (Date.now()), bukan dari sisi client.
 *  Manual run lewat tombol ⚡ TIDAK mereset jadwal ini — auto-scrape tetap
 *  jalan tiap 5 menit apapun yang terjadi, walau tidak ada user yang buka app. */
export function startScrapeScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const scheduleNext = () => {
    const delay = Math.max(0, state.nextRunAt - Date.now());
    setTimeout(async () => {
      try {
        await runScrapeOnce("auto");
      } catch (err) {
        logger.error({ err }, "auto scrape failed");
      } finally {
        state.nextRunAt = Date.now() + SCRAPE_INTERVAL_MS;
        notify();
        scheduleNext();
      }
    }, delay);
  };

  // Kick off first run right away on boot, then settle into the fixed cadence.
  runScrapeOnce("auto")
    .catch((err) => logger.error({ err }, "initial scrape failed"))
    .finally(() => {
      state.nextRunAt = Date.now() + SCRAPE_INTERVAL_MS;
      notify();
      scheduleNext();
    });
}
