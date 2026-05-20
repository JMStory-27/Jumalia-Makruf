/**
 * Scheduler — scrape Otakudesu tiap 30 menit, push JSON ke GitHub.
 * Jalan di API server. Token butuh scope: repo (sudah ada).
 */

import { logger } from "./logger";

const SOURCE = "https://akillisaha.net";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const GH_OWNER = process.env["GITHUB_OWNER"] ?? "";
const GH_REPO  = process.env["GITHUB_REPO"]  ?? "";
const GH_TOKEN = process.env["GITHUB_TOKEN"] ?? "";

const INTERVAL_MS = 30 * 60 * 1000; // 30 menit

// ── Scraping helpers ──────────────────────────────────────────────────────────

async function fetchHtml(path: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${SOURCE}${path}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
        "Cache-Control": "no-cache",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

function getRsc(html: string): string {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)]
    .map((m) => {
      try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
    })
    .join(" ");
}

interface AnimeCard {
  title: string;
  poster: string;
  episodes?: string;
  animeId: string;
}

function parseAnimeList(rsc: string): AnimeCard[] {
  const cards: AnimeCard[] = [];
  const seen = new Set<string>();
  const re =
    /"href":"\/anime\/([a-z0-9-]+)"[\s\S]{0,2000}?"src":"(https:\/\/otakudesu\.blog\/wp-content[^"]+)","alt":"Poster anime ([^"]+)"/g;
  for (const m of rsc.matchAll(re)) {
    const [, slug, poster, altTitle] = m;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const win = rsc.slice(m.index!, m.index! + m[0].length + 500);
    const epsM = win.match(/"children":"Eps\s*\.?\s*(\d+)"|"children":"(\d+)\s*Ep/i);
    const episodes = epsM?.[1] ?? epsM?.[2];
    cards.push({ title: altTitle.trim(), poster, animeId: slug, ...(episodes ? { episodes } : {}) });
  }
  return cards;
}

function parseMaxPage(rsc: string, basePath: string): number {
  const re = new RegExp(`"href":"${basePath}\\?page=(\\d+)"`, "g");
  let max = 1;
  for (const m of rsc.matchAll(re)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeOngoing() {
  const html = await fetchHtml("/ongoing");
  const rsc = getRsc(html);
  const animeList = parseAnimeList(rsc);
  const maxPage = parseMaxPage(rsc, "\\/ongoing");
  // Ambil max 3 halaman tambahan biar cepet
  const maxFetch = Math.min(maxPage, 3);
  for (let page = 2; page <= maxFetch; page++) {
    try {
      await sleep(1200);
      const h2 = await fetchHtml(`/ongoing?page=${page}`);
      const r2 = getRsc(h2);
      for (const a of parseAnimeList(r2)) {
        if (!animeList.find((x) => x.animeId === a.animeId)) animeList.push(a);
      }
    } catch (e) {
      logger.warn({ page, err: String(e) }, "scheduler: ongoing page failed");
    }
  }
  return { animeList, maxPage, updatedAt: new Date().toISOString() };
}

async function scrapeCompleted() {
  const html = await fetchHtml("/completed");
  const rsc = getRsc(html);
  return {
    animeList: parseAnimeList(rsc),
    maxPage: parseMaxPage(rsc, "\\/completed"),
    updatedAt: new Date().toISOString(),
  };
}

async function scrapeSchedule() {
  const html = await fetchHtml("/jadwal");
  const rsc = getRsc(html);
  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const dayPattern = new RegExp(`"div","(${days.join("|")})",\\{`, "g");
  const positions: { day: string; index: number }[] = [];
  for (const m of rsc.matchAll(dayPattern)) positions.push({ day: m[1], index: m.index! });
  positions.push({ day: "__end__", index: rsc.length });

  const scheduleList = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const { day, index: start } = positions[i];
    const section = rsc.slice(start, positions[i + 1].index);
    const animeList: { title: string; animeId: string }[] = [];
    const seen = new Set<string>();
    const linkRe =
      /"href":"\/anime\/([a-z0-9-]+)"[\s\S]{0,800}?"[^"]*leading-snug[^"]*","children":"([^"]{3,150})"/g;
    for (const m of section.matchAll(linkRe)) {
      const [, animeId, title] = m;
      if (!seen.has(animeId)) { seen.add(animeId); animeList.push({ title: title.trim(), animeId }); }
    }
    scheduleList.push({ title: day, animeList });
  }
  return { scheduleList, updatedAt: new Date().toISOString() };
}

// ── GitHub push helpers ───────────────────────────────────────────────────────

async function ghGetFileSha(path: string): Promise<string | null> {
  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) return null;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "LawnimeBot",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!r.ok) return null;
    const d = await r.json() as { sha?: string };
    return d.sha ?? null;
  } catch {
    return null;
  }
}

async function ghPutFile(path: string, content: string, message: string): Promise<boolean> {
  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    logger.warn("scheduler: GITHUB_TOKEN/OWNER/REPO tidak tersedia, skip push");
    return false;
  }
  const sha = await ghGetFileSha(path);
  const body: Record<string, unknown> = { message, content: Buffer.from(content).toString("base64") };
  if (sha) body.sha = sha;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "LawnimeBot",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    );
    return r.ok;
  } catch (e) {
    logger.warn({ err: String(e), path }, "scheduler: ghPutFile failed");
    return false;
  }
}

// ── Main scrape + push job ────────────────────────────────────────────────────

async function runScrapeJob(): Promise<void> {
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  logger.info("scheduler: mulai scrape job");

  const [ongoing, completed, schedule] = await Promise.allSettled([
    scrapeOngoing(),
    (async () => { await sleep(500); return scrapeCompleted(); })(),
    (async () => { await sleep(1000); return scrapeSchedule(); })(),
  ]);

  const msg = `chore: update anime data [${ts}]`;
  let pushed = 0;

  if (ongoing.status === "fulfilled") {
    const json = JSON.stringify(ongoing.value);
    const ok = await ghPutFile("data/ongoing.json", json, msg);
    if (ok) pushed++;
    logger.info({ count: ongoing.value.animeList.length, pushed: ok }, "scheduler: ongoing done");
  } else {
    logger.error({ err: String(ongoing.reason) }, "scheduler: ongoing failed");
  }

  if (completed.status === "fulfilled") {
    const json = JSON.stringify(completed.value);
    const ok = await ghPutFile("data/completed.json", json, msg);
    if (ok) pushed++;
    logger.info({ count: completed.value.animeList.length, pushed: ok }, "scheduler: completed done");
  } else {
    logger.error({ err: String(completed.reason) }, "scheduler: completed failed");
  }

  if (schedule.status === "fulfilled") {
    const json = JSON.stringify(schedule.value);
    const ok = await ghPutFile("data/schedule.json", json, msg);
    if (ok) pushed++;
    logger.info({ pushed: ok }, "scheduler: schedule done");
  } else {
    logger.error({ err: String(schedule.reason) }, "scheduler: schedule failed");
  }

  logger.info({ pushed, total: 3 }, "scheduler: job selesai");
}

// ── Start scheduler ───────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    logger.warn("scheduler: env GITHUB_TOKEN/OWNER/REPO kosong — scheduler tidak aktif");
    return;
  }

  logger.info({ intervalMs: INTERVAL_MS }, "scheduler: aktif, scrape pertama dalam 60 detik");

  // Pertama kali: delay 60 detik biar server stabil dulu
  setTimeout(() => {
    runScrapeJob().catch((e) => logger.error({ err: String(e) }, "scheduler: job error"));
    _timer = setInterval(() => {
      runScrapeJob().catch((e) => logger.error({ err: String(e) }, "scheduler: job error"));
    }, INTERVAL_MS);
  }, 60_000);
}

export function stopScheduler(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
