/**
 * Standalone scraper for GitHub Actions
 * Scrapes Otakudesu data dan simpan sebagai JSON di data/
 * Run: node scripts/scrape-github-data.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");

const SOURCE = "https://akillisaha.net";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchHtml(path) {
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
    if (!res.ok) throw new Error(`HTTP ${res.status} dari ${SOURCE}${path}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

function getRsc(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)]
    .map((m) => {
      try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
    })
    .join(" ");
}

function parseAnimeList(rsc) {
  const cards = [];
  const seen = new Set();
  const re =
    /"href":"\/anime\/([a-z0-9-]+)"[\s\S]{0,2000}?"src":"(https:\/\/otakudesu\.blog\/wp-content[^"]+)","alt":"Poster anime ([^"]+)"/g;
  for (const m of rsc.matchAll(re)) {
    const [, slug, poster, altTitle] = m;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const win = rsc.slice(m.index, m.index + m[0].length + 500);
    const epsM = win.match(/"children":"Eps\s*\.?\s*(\d+)"|"children":"(\d+)\s*Ep/i);
    const episodes = epsM?.[1] ?? epsM?.[2];
    cards.push({ title: altTitle.trim(), poster, animeId: slug, ...(episodes ? { episodes } : {}) });
  }
  return cards;
}

function parseMaxPage(rsc, basePath) {
  const re = new RegExp(`"href":"${basePath}\\?page=(\\d+)"`, "g");
  let max = 1;
  for (const m of rsc.matchAll(re)) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeOngoing() {
  console.log("📥 Scraping ongoing...");
  const html = await fetchHtml("/ongoing");
  const rsc = getRsc(html);
  const animeList = parseAnimeList(rsc);
  const maxPage = parseMaxPage(rsc, "\\/ongoing");
  const maxFetch = Math.min(maxPage, 4);
  for (let page = 2; page <= maxFetch; page++) {
    try {
      await sleep(1200);
      const h2 = await fetchHtml(`/ongoing?page=${page}`);
      const r2 = getRsc(h2);
      for (const a of parseAnimeList(r2)) {
        if (!animeList.find((x) => x.animeId === a.animeId)) animeList.push(a);
      }
    } catch (e) {
      console.warn(`  ⚠️  Page ${page} gagal: ${e.message}`);
    }
  }
  return { animeList, maxPage, updatedAt: new Date().toISOString() };
}

async function scrapeCompleted() {
  console.log("📥 Scraping completed...");
  const html = await fetchHtml("/completed");
  const rsc = getRsc(html);
  const animeList = parseAnimeList(rsc);
  const maxPage = parseMaxPage(rsc, "\\/completed");
  return { animeList, maxPage, updatedAt: new Date().toISOString() };
}

async function scrapeSchedule() {
  console.log("📥 Scraping schedule...");
  const html = await fetchHtml("/jadwal");
  const rsc = getRsc(html);
  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const dayPattern = new RegExp(`"div","(${days.join("|")})",\\{`, "g");
  const positions = [];
  for (const m of rsc.matchAll(dayPattern)) positions.push({ day: m[1], index: m.index });
  positions.push({ day: "__end__", index: rsc.length });
  const scheduleList = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const { day, index: start } = positions[i];
    const section = rsc.slice(start, positions[i + 1].index);
    const animeList = [];
    const seen = new Set();
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

// ── Main ─────────────────────────────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true });

console.log("🚀 Mulai scraping anime data...\n");

const [ongoing, completed, schedule] = await Promise.allSettled([
  scrapeOngoing(),
  (async () => { await sleep(500); return scrapeCompleted(); })(),
  (async () => { await sleep(1000); return scrapeSchedule(); })(),
]);

let success = 0;
if (ongoing.status === "fulfilled") {
  writeFileSync(join(DATA_DIR, "ongoing.json"), JSON.stringify(ongoing.value));
  console.log(`✅ ongoing.json — ${ongoing.value.animeList.length} anime`);
  success++;
} else {
  console.error("❌ ongoing gagal:", ongoing.reason?.message);
}

if (completed.status === "fulfilled") {
  writeFileSync(join(DATA_DIR, "completed.json"), JSON.stringify(completed.value));
  console.log(`✅ completed.json — ${completed.value.animeList.length} anime`);
  success++;
} else {
  console.error("❌ completed gagal:", completed.reason?.message);
}

if (schedule.status === "fulfilled") {
  writeFileSync(join(DATA_DIR, "schedule.json"), JSON.stringify(schedule.value));
  console.log(`✅ schedule.json tersimpan`);
  success++;
} else {
  console.error("❌ schedule gagal:", schedule.reason?.message);
}

console.log(`\n🎉 Selesai! ${success}/3 berhasil.`);
if (success === 0) process.exit(1);
