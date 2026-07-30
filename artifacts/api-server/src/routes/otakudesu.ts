import { Router, type IRouter } from "express";
import { existsSync, readFileSync } from "fs";

const router: IRouter = Router();

const GH_RAW = "https://raw.githubusercontent.com/JMStory-27/Jumalia-Makruf/main/data";
const PAGE_SIZE = 25;
const CACHE_TTL = 10 * 60 * 1000; // 10 menit

// ─── AniList poster map (dari full cache yang di-download cache.ts) ───────────
// Prioritas: workspace persisten → /tmp fallback (sesuai cache.ts)
const WORKSPACE_CACHE_PATH = "/home/runner/workspace/.cache/anisub-full-cache.json";
const TMP_CACHE_PATH = "/tmp/anisub-full-cache.json";
function getLocalCachePath(): string {
  return existsSync(WORKSPACE_CACHE_PATH) ? WORKSPACE_CACHE_PATH : TMP_CACHE_PATH;
}
let _anilistMap: Map<string, { posterHD: string; banner?: string }> | null = null;
let _anilistMapLoadedAt = 0;
const MAP_TTL = 24 * 3600_000; // reload setiap 24 jam kalau file berubah

// Full cache index (semua field: synopsis, trailer, staff, characters, dsb.)
type FullCacheEntry = Record<string, unknown>;
let _fullCacheIndex: Map<string, FullCacheEntry> | null = null;
let _fullCacheIndexLoadedAt = 0;

function getAnilistMap(): Map<string, { posterHD: string; banner?: string }> {
  const now = Date.now();
  if (_anilistMap && now - _anilistMapLoadedAt < MAP_TTL) return _anilistMap;
  const cachePath = getLocalCachePath();
  if (!existsSync(cachePath)) return new Map();
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const json = JSON.parse(raw) as { anime?: Array<{ animeId?: string; id?: string; posterHD?: string; banner?: string }> };
    const arr = json.anime || [];
    const map = new Map<string, { posterHD: string; banner?: string }>();
    for (const entry of arr) {
      const id = entry.animeId || entry.id;
      if (id && entry.posterHD) map.set(id, { posterHD: entry.posterHD, banner: entry.banner });
    }
    _anilistMap = map;
    _anilistMapLoadedAt = now;
    return map;
  } catch {
    return _anilistMap ?? new Map();
  }
}

/** Lazy-load full cache index: semua field per animeId */
function getFullCacheIndex(): Map<string, FullCacheEntry> {
  const now = Date.now();
  if (_fullCacheIndex && now - _fullCacheIndexLoadedAt < MAP_TTL) return _fullCacheIndex;
  const cachePath = getLocalCachePath();
  if (!existsSync(cachePath)) return new Map();
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const json = JSON.parse(raw) as { anime?: FullCacheEntry[] };
    const arr = json.anime || [];
    const index = new Map<string, FullCacheEntry>();
    for (const entry of arr) {
      const id = (entry.animeId || entry.id) as string | undefined;
      if (id) index.set(id, entry);
    }
    _fullCacheIndex = index;
    _fullCacheIndexLoadedAt = now;
    return index;
  } catch {
    return _fullCacheIndex ?? new Map();
  }
}

/**
 * Fallback lookup: strip season suffix dari animeId dan coba lagi.
 * Contoh: "nige-wakagimi-s2-sub-indo" → "nige-wakagimi-sub-indo"
 * Juga coba: "nige-wakagimi-s2" → "nige-wakagimi"
 */
function lookupWithSeasonFallback(
  map: Map<string, { posterHD: string; banner?: string }>,
  animeId: string
): { posterHD: string; banner?: string } | undefined {
  // 1. Exact match
  const exact = map.get(animeId);
  if (exact) return exact;

  // 2. Strip "-s{N}" anywhere in the ID (e.g. -s2-, -s3-)
  const stripped = animeId
    .replace(/-s\d+(-sub-indo)?(-sub)?$/i, "-sub-indo")  // suffix: nige-waka-s2-sub-indo → nige-waka-sub-indo
    .replace(/-s\d+/gi, "");                               // middle: nige-s2-waka → nige-waka
  if (stripped !== animeId) {
    const fallback = map.get(stripped);
    if (fallback) return fallback;
    // juga coba tanpa -sub-indo sama sekali
    const noSuffix = stripped.replace(/-sub-indo$/, "");
    const fallback2 = map.get(noSuffix);
    if (fallback2) return fallback2;
  }

  // 3. Strip trailing "-sub-indo" lalu coba lagi
  const noSuffix = animeId.replace(/-sub-indo$/, "");
  if (noSuffix !== animeId) {
    const f = map.get(noSuffix);
    if (f) return f;
  }

  return undefined;
}

/** Tambahkan anilistPoster ke daftar AnimeCard dari full cache map */
function enrichWithAnilistPoster<T extends { animeId: string }>(
  list: T[]
): (T & { anilistPoster?: string | null })[] {
  const map = getAnilistMap();
  if (map.size === 0) return list;
  return list.map((card) => {
    const entry = lookupWithSeasonFallback(map, card.animeId);
    return entry ? { ...card, anilistPoster: entry.posterHD } : card;
  });
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; ts: number }
const _cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const entry = _cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { _cache.delete(key); return null; }
  return entry.data;
}
function cacheSet<T>(key: string, data: T): void {
  _cache.set(key, { data, ts: Date.now() });
}

// ─── GitHub data fetcher ──────────────────────────────────────────────────────
interface AnimeCard {
  title: string;
  poster: string;
  episodes?: string;
  animeId: string;
  latestReleaseDate?: string;
  lastReleaseDate?: string;
  releaseDay?: string;
  score?: string;
  status?: string;
  genres?: string[];
  otakudesuUrl?: string;
}

async function fetchGhList(filename: string): Promise<AnimeCard[]> {
  const cached = cacheGet<AnimeCard[]>(filename);
  if (cached) return cached;

  const res = await fetch(`${GH_RAW}/${filename}`, {
    headers: { Accept: "application/json", "User-Agent": "AniSub-API/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GH fetch ${filename} failed: ${res.status}`);
  const json = (await res.json()) as { animeList: AnimeCard[] };
  const list = json.animeList || [];
  cacheSet(filename, list);
  return list;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/otakudesu/ongoing?page=N
router.get("/otakudesu/ongoing", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const list = await fetchGhList("ongoing.json");
    const maxPage = Math.ceil(list.length / PAGE_SIZE);
    const animeList = enrichWithAnilistPoster(list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
    res.json({ data: { animeList, maxPage, totalItems: list.length } });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/otakudesu/completed?page=N
router.get("/otakudesu/completed", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const list = await fetchGhList("completed.json");
    const maxPage = Math.ceil(list.length / PAGE_SIZE);
    const animeList = enrichWithAnilistPoster(list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
    res.json({ data: { animeList, maxPage, totalItems: list.length } });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/otakudesu/search?q=...
router.get("/otakudesu/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").toLowerCase().trim();
    if (!q) return res.json({ data: { animeList: [] } });

    const [ongoing, completed] = await Promise.allSettled([
      fetchGhList("ongoing.json"),
      fetchGhList("completed.json"),
    ]);
    const all = [
      ...(ongoing.status === "fulfilled" ? ongoing.value : []),
      ...(completed.status === "fulfilled" ? completed.value : []),
    ];
    const results = enrichWithAnilistPoster(
      all.filter(a => a.title.toLowerCase().includes(q)).slice(0, 30)
    );
    res.json({ data: { animeList: results } });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/otakudesu/schedule
router.get("/otakudesu/schedule", async (req, res) => {
  try {
    const cached = cacheGet<unknown>("schedule.json");
    if (cached) return res.json({ data: cached });

    const r = await fetch(`${GH_RAW}/schedule.json`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    const json = await r.json();
    cacheSet("schedule.json", json);
    res.json({ data: json });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// GET /api/otakudesu/genre
router.get("/otakudesu/genre", async (req, res) => {
  // Static genre list dari OtakuDesu
  res.json({
    data: {
      genreList: [
        { genreId: "action", title: "Action" },
        { genreId: "adventure", title: "Adventure" },
        { genreId: "comedy", title: "Comedy" },
        { genreId: "drama", title: "Drama" },
        { genreId: "ecchi", title: "Ecchi" },
        { genreId: "fantasy", title: "Fantasy" },
        { genreId: "game", title: "Game" },
        { genreId: "harem", title: "Harem" },
        { genreId: "historical", title: "Historical" },
        { genreId: "horror", title: "Horror" },
        { genreId: "josei", title: "Josei" },
        { genreId: "magic", title: "Magic" },
        { genreId: "martial-arts", title: "Martial Arts" },
        { genreId: "mecha", title: "Mecha" },
        { genreId: "military", title: "Military" },
        { genreId: "music", title: "Music" },
        { genreId: "mystery", title: "Mystery" },
        { genreId: "psychological", title: "Psychological" },
        { genreId: "romance", title: "Romance" },
        { genreId: "school", title: "School" },
        { genreId: "sci-fi", title: "Sci-Fi" },
        { genreId: "seinen", title: "Seinen" },
        { genreId: "shojo", title: "Shojo" },
        { genreId: "shonen", title: "Shonen" },
        { genreId: "slice-of-life", title: "Slice of Life" },
        { genreId: "sports", title: "Sports" },
        { genreId: "super-power", title: "Super Power" },
        { genreId: "supernatural", title: "Supernatural" },
        { genreId: "thriller", title: "Thriller" },
      ],
    },
  });
});

// GET /api/anisub/rich/:animeId
// Ambil data lengkap anime dari full cache (synopsis, trailer, staff, characters+VA, dsb.)
// tanpa perlu fetch ke AniList dari client. Cache dibaca dari /tmp/anisub-full-cache.json.
router.get("/anisub/rich/:animeId", (req, res) => {
  const { animeId } = req.params;
  if (!animeId) return res.status(400).json({ error: "animeId wajib" });

  const index = getFullCacheIndex();
  if (index.size === 0) {
    return res.status(503).json({ error: "Full cache belum tersedia — coba beberapa saat lagi" });
  }

  const entry = index.get(animeId);
  if (!entry) {
    return res.status(404).json({ error: "Anime tidak ditemukan di cache" });
  }

  // Cache 24 jam di CDN/browser — data jarang berubah kecuali setelah scrape ulang
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.json({ data: entry });
});


export default router;
