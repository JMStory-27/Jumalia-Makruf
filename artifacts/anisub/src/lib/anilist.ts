import { idbCacheGet, idbCacheSet, idbCacheKeys, idbCacheDel } from "./persistentCache";

const ANILIST_URL = "https://graphql.anilist.co";

export interface AniListAnime {
  id: number;
  idMal?: number | null;
  title: { romaji: string; english?: string | null; native?: string | null };
  coverImage: { large: string; extraLarge?: string };
  bannerImage?: string | null;
  episodes?: number | null;
  averageScore?: number | null;
  genres: string[];
  status: string;
  description?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  studios?: { nodes: { name: string }[] };
  nextAiringEpisode?: { episode: number; timeUntilAiring: number } | null;
  streamingEpisodes?: { title: string; thumbnail: string; url: string; site: string }[];
  externalLinks?: { site: string; url: string; color?: string | null }[];
  trailer?: { id: string; site: string } | null;
  popularity?: number;
}

const ANIME_FIELDS = `
  id
  idMal
  title { romaji english native }
  coverImage { large extraLarge }
  bannerImage
  episodes
  averageScore
  genres
  status
  description(asHtml: false)
  season
  seasonYear
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { episode timeUntilAiring }
  externalLinks { site url color }
  trailer { id site }
  popularity
`;

// ── Priority queue untuk SEMUA request GraphQL ke AniList ──────────────────────
// Priority 'high' = on-demand user (buka detail/klik VA) → loncat ke depan antrian.
// Priority 'low'  = background prefetch → tunggu giliran setelah semua 'high' selesai.
// Ini mencegah ratusan banner prefetch menyumbat antrian dan membuat halaman detail
// user stuck di skeleton selamanya.
interface _AQTask { fn: () => Promise<unknown>; res: (v: unknown) => void; rej: (e: unknown) => void; priority: 'high' | 'low' }
const _aq: _AQTask[] = [];
let _aqRunning = false;
let pausedUntil = 0;
const ANILIST_MIN_GAP_MS = 350;

async function _runAQ() {
  if (_aqRunning) return;
  _aqRunning = true;
  while (_aq.length > 0) {
    // Ambil task 'high' lebih dulu — kalau tidak ada, ambil 'low' paling depan
    const hi = _aq.findIndex(t => t.priority === 'high');
    const task = hi >= 0 ? _aq.splice(hi, 1)[0] : _aq.shift()!;
    const remaining = pausedUntil - Date.now();
    if (remaining > 0) {
      // High priority: tunggu paling lama 5 detik, bukan full Retry-After
      const wait = task.priority === 'high' ? Math.min(remaining, 5_000) : remaining;
      await new Promise(r => setTimeout(r, wait));
    }
    await new Promise(r => setTimeout(r, ANILIST_MIN_GAP_MS));
    try { task.res(await task.fn()); } catch (e) { task.rej(e); }
  }
  _aqRunning = false;
}

function enqueueAniListRequest<T>(fn: () => Promise<T>, priority: 'high' | 'low' = 'low'): Promise<T> {
  return new Promise<T>((res, rej) => {
    _aq.push({ fn: fn as () => Promise<unknown>, res: res as (v: unknown) => void, rej, priority });
    _runAQ();
  });
}

async function anilistQuery(query: string, priority: 'high' | 'low' = 'low'): Promise<unknown> {
  let lastErr: Error | null = null;
  // High priority (klik user) = 3 percobaan cepat; Low priority = 6 percobaan sabar.
  const maxAttempts = priority === 'high' ? 3 : 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = priority === 'high'
        ? Math.min(attempt * 1000, 2_000)        // high: 0 → 1s → 2s
        : Math.min(attempt * 2500, 12_000);      // low:  0 → 2.5s → 5s → ... → 12s
      await new Promise(r => setTimeout(r, delay));
    }
    try {
      return await enqueueAniListRequest(async () => {
        const res = await fetch(ANILIST_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(12_000),
        });
        if (res.status === 429) {
          // Rate limited — baca Retry-After.
          // Low priority: pause penuh sampai 30s.
          // High priority (klik user): pause MAX 5s supaya tidak lama menunggu.
          const ra = parseInt(res.headers.get("Retry-After") ?? "10", 10);
          const fullPause = isNaN(ra) ? 10_000 : Math.min(ra * 1000, 30_000);
          pausedUntil = Date.now() + (priority === 'high' ? Math.min(fullPause, 5_000) : fullPause);
          // Drop semua low-priority dari antrian agar background prefetch
          // tidak terus-terusan memblokir request user setelah rate limit.
          const dropped = _aq.filter(t => t.priority === 'low');
          _aq.splice(0, _aq.length, ..._aq.filter(t => t.priority === 'high'));
          for (const t of dropped) t.rej(new Error("AniList rate limited — low priority dropped"));
          throw new Error("AniList rate limited (429)");
        }
        if (!res.ok) throw new Error(`AniList error ${res.status}`);
        return res.json();
      }, priority);
    } catch (e) { lastErr = e as Error; continue; }
  }
  throw lastErr ?? new Error("AniList request failed");
}

// ── Trending / Top Anime dari AniList ─────────────────────────────────────────
export interface AniListTrendingItem {
  id: number;
  title: { romaji: string; english?: string | null };
  coverImage: { large: string; extraLarge?: string };
  bannerImage?: string | null;
  meanScore?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  episodes?: number | null;
  status: string;
  genres: string[];
  season?: string | null;
  seasonYear?: number | null;
  studios?: { nodes: { name: string }[] };
  trending?: number | null;
}

const TRENDING_FIELDS = `
  id title { romaji english }
  coverImage { large extraLarge }
  bannerImage meanScore averageScore popularity
  episodes status genres season seasonYear trending
  studios(isMain: true) { nodes { name } }
`;

function getCurrentSeason(): { season: string; year: number } {
  const m = new Date().getMonth() + 1;
  const y = new Date().getFullYear();
  const s = m <= 3 ? "WINTER" : m <= 6 ? "SPRING" : m <= 9 ? "SUMMER" : "FALL";
  return { season: s, year: y };
}

const TRENDING_CACHE_TTL = 30 * 60_000; // 30 menit
const _trendingCache = new Map<string, { data: AniListTrendingItem[]; cachedAt: number }>();

export async function fetchAniListTrending(
  filter: "today" | "season" | "year" | "alltime",
  perPage = 12,
  priority: 'high' | 'low' = 'low'
): Promise<AniListTrendingItem[]> {
  const cacheKey = `trending_${filter}_${perPage}`;
  const cached = _trendingCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < TRENDING_CACHE_TTL) return cached.data;

  const { season, year } = getCurrentSeason();
  let mediaArgs = "";
  if (filter === "today") {
    mediaArgs = `type: ANIME, sort: TRENDING_DESC, status_in: [RELEASING]`;
  } else if (filter === "season") {
    mediaArgs = `type: ANIME, sort: POPULARITY_DESC, season: ${season}, seasonYear: ${year}`;
  } else if (filter === "year") {
    mediaArgs = `type: ANIME, sort: POPULARITY_DESC, seasonYear: ${year}`;
  } else {
    mediaArgs = `type: ANIME, sort: SCORE_DESC, status: FINISHED, averageScore_greater: 70`;
  }

  const q = `{
    Page(page: 1, perPage: ${perPage}) {
      media(${mediaArgs}) { ${TRENDING_FIELDS} }
    }
  }`;

  try {
    const json = (await anilistQuery(q, priority)) as {
      data: { Page: { media: AniListTrendingItem[] } };
    };
    const list = json.data?.Page?.media ?? [];
    _trendingCache.set(cacheKey, { data: list, cachedAt: Date.now() });
    return list;
  } catch {
    return cached?.data ?? [];
  }
}

export async function fetchAiringAnime(
  page = 1,
  perPage = 24
): Promise<{ list: AniListAnime[]; hasNextPage: boolean }> {
  const q = `{
    Page(page: ${page}, perPage: ${perPage}) {
      pageInfo { hasNextPage }
      media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) { ${ANIME_FIELDS} }
    }
  }`;
  const json = (await anilistQuery(q)) as { data: { Page: { pageInfo: { hasNextPage: boolean }; media: AniListAnime[] } } };
  return {
    list: json.data?.Page?.media ?? [],
    hasNextPage: json.data?.Page?.pageInfo?.hasNextPage ?? false,
  };
}

export async function fetchPopularAnime(
  page = 1,
  perPage = 24
): Promise<{ list: AniListAnime[]; hasNextPage: boolean }> {
  const q = `{
    Page(page: ${page}, perPage: ${perPage}) {
      pageInfo { hasNextPage }
      media(type: ANIME, sort: POPULARITY_DESC, status_in: [RELEASING, FINISHED]) { ${ANIME_FIELDS} }
    }
  }`;
  const json = (await anilistQuery(q)) as { data: { Page: { pageInfo: { hasNextPage: boolean }; media: AniListAnime[] } } };
  return {
    list: json.data?.Page?.media ?? [],
    hasNextPage: json.data?.Page?.pageInfo?.hasNextPage ?? false,
  };
}

export async function fetchAniListDetail(id: number): Promise<AniListAnime> {
  const q = `{
    Media(id: ${id}, type: ANIME) {
      ${ANIME_FIELDS}
      streamingEpisodes { title thumbnail url site }
    }
  }`;
  const json = (await anilistQuery(q)) as { data: { Media: AniListAnime } };
  return json.data?.Media;
}

// ── Seasons & Upcoming ─────────────────────────────────────────────────────────
// Tipe lebih kaya untuk halaman "Musim": detail yang sebelumnya tidak diambil
// (description, staff, characters+VA, trailer) ikut diambil di sini.
export interface UpcomingAnime {
  id: number;
  idMal?: number | null;
  title: { romaji: string; english?: string | null; native?: string | null };
  coverImage: { large: string; extraLarge?: string };
  bannerImage?: string | null;
  description?: string | null;
  genres: string[];
  status: string;
  episodes?: number | null;
  duration?: number | null;
  format?: string | null;
  averageScore?: number | null;
  meanScore?: number | null;
  popularity?: number;
  season?: string | null;
  seasonYear?: number | null;
  startDate?: { year: number; month: number; day: number } | null;
  studios?: { nodes: { name: string }[] };
  trailer?: { id: string; site: string } | null;
  // Untuk hitung mundur akurat: waktu rilis episode pertama (Unix detik)
  nextAiringEpisode?: { episode: number; airingAt: number; timeUntilAiring: number } | null;
  // Detail hanya diambil saat buka halaman detail (berat, hemat quota)
  staff?: {
    edges: { role: string; node: { id: number; name: { full: string; native?: string | null }; image?: { medium?: string | null } | null } }[];
  } | null;
  characters?: {
    edges: {
      role: string;
      node: { id: number; name: { full: string; native?: string | null }; image?: { medium?: string | null } | null };
      voiceActors?: { id: number; name: { full: string }; image?: { medium?: string | null } | null }[];
    }[];
  } | null;
}

const UPCOMING_FIELDS = `
  id idMal
  title { romaji english native }
  coverImage { large extraLarge }
  bannerImage
  description(asHtml: false)
  genres status episodes duration format
  averageScore meanScore popularity
  season seasonYear
  startDate { year month day }
  studios(isMain: true) { nodes { name } }
  trailer { id site }
  nextAiringEpisode { episode airingAt timeUntilAiring }
`;

export interface SeasonKey { season: "WINTER" | "SPRING" | "SUMMER" | "FALL"; year: number; }

/** Daftar 4 musim ke depan dari tanggal hari ini (inklusif musim yg sedang berjalan).
 *  Carry otomatis ke tahun berikutnya saat melewati FALL → WINTER. */
export function getUpcomingSeasons(now = new Date()): SeasonKey[] {
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const cur: SeasonKey["season"] = m <= 3 ? "WINTER" : m <= 6 ? "SPRING" : m <= 9 ? "SUMMER" : "FALL";
  const order: SeasonKey["season"][] = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const fixed: SeasonKey[] = [];
  let idx = order.indexOf(cur);
  let year = y;
  for (let i = 0; i < 4; i++) {
    fixed.push({ season: order[idx], year });
    if (idx === 3) { idx = 0; year++; } else idx++;
  }
  return fixed;
}

const _seasonCache = new Map<string, { data: UpcomingAnime[]; cachedAt: number }>();
const SEASON_CACHE_TTL = 60 * 60_000; // 1 jam — season lineup jarang berubah

/** Ambil lineup anime untuk 1 musim (AniList: status NOT_YET_RELEASED + season X + year Y). */
export async function fetchSeasonLineup(
  sk: SeasonKey,
  perPage = 36,
  priority: 'high' | 'low' = 'low'
): Promise<UpcomingAnime[]> {
  const key = `${sk.season}_${sk.year}_${perPage}`;
  const cached = _seasonCache.get(key);
  if (cached && Date.now() - cached.cachedAt < SEASON_CACHE_TTL) return cached.data;

  const q = `
    query($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage currentPage }
        media(
          type: ANIME,
          season: $season,
          seasonYear: $year,
          sort: POPULARITY_DESC,
          status_in: [NOT_YET_RELEASED, RELEASING]
        ) { ${UPCOMING_FIELDS} }
      }
    }
  `

  const all: UpcomingAnime[] = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const variables = { season: sk.season, year: sk.year, page, perPage };
      const json = (await anilistQuery(q, priority)) as {
        data: { Page: { pageInfo: { hasNextPage: boolean; currentPage: number }; media: UpcomingAnime[] } };
      };
      const media = json?.data?.Page?.media ?? [];
      all.push(...media);
      if (!json?.data?.Page?.pageInfo?.hasNextPage) break;
    }
    _seasonCache.set(key, { data: all, cachedAt: Date.now() });
    return all;
  } catch (e) {
    return cached?.data ?? [];
  }
}

/** Detail lengkap sebuah anime (untuk halaman detail Musim): staff, karakter+VA. */
const RICH_UPCOMING_FIELDS = `
  id idMal
  title { romaji english native }
  coverImage { large extraLarge }
  bannerImage
  description(asHtml: false)
  genres status episodes duration format
  averageScore meanScore popularity
  season seasonYear
  startDate { year month day }
  studios(isMain: true) { nodes { name } }
  trailer { id site }
  nextAiringEpisode { episode airingAt timeUntilAiring }
  staff(perPage: 12) {
    edges {
      role
      node { id name { full native } image { medium } }
    }
  }
  characters(perPage: 16, sort: ROLE) {
    edges {
      role
      node { id name { full native } image { medium } }
      voiceActors(language: JAPANESE) { id name { full native } image { medium } }
    }
  }
`;

const _upcomingRichCache = new Map<number, { data: UpcomingAnime; cachedAt: number }>();

export async function fetchUpcomingDetail(id: number, priority: 'high' | 'low' = 'high'): Promise<UpcomingAnime | null> {
  const cached = _upcomingRichCache.get(id);
  if (cached && Date.now() - cached.cachedAt < SEASON_CACHE_TTL) return cached.data;
  const q = `query($id: Int) {
    Media(id: $id, type: ANIME) { ${RICH_UPCOMING_FIELDS} }
  }`;
  try {
    const json = (await anilistQuery(q, priority)) as { data: { Media: UpcomingAnime } };
    const m = json?.data?.Media;
    if (m) _upcomingRichCache.set(id, { data: m, cachedAt: Date.now() });
    return m ?? null;
  } catch {
    return cached?.data ?? null;
  }
}

/** Format detik → string countdown akurat "X bulan Y hari Z jam W menit V detik"
 *  (selalu tampil SATU unit terbesar yang signifikan + sisanya).
 *  Contoh: 90 hari 12 jam → "3 bln 0 hr 12 jam", dll. */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Sekarang!";
  const SEC_PER_MIN = 60;
  const SEC_PER_HOUR = 3600;
  const SEC_PER_DAY = 86400;
  const SEC_PER_MONTH = 30 * SEC_PER_DAY; // pendekatan 1 bulan = 30 hari (andum konsisten)
  const SEC_PER_YEAR = 365 * SEC_PER_DAY;

  const years  = Math.floor(seconds / SEC_PER_YEAR);
  const months = Math.floor((seconds % SEC_PER_YEAR) / SEC_PER_MONTH);
  const days   = Math.floor((seconds % SEC_PER_MONTH) / SEC_PER_DAY);
  const hours  = Math.floor((seconds % SEC_PER_DAY) / SEC_PER_HOUR);
  const mins   = Math.floor((seconds % SEC_PER_HOUR) / SEC_PER_MIN);
  const secs   = Math.floor(seconds % SEC_PER_MIN);

  const parts: string[] = [];
  if (years)  parts.push(`${years} tahun`);
  if (months) parts.push(`${months} bln`);
  if (days)   parts.push(`${days} hr`);
  // Jika ada tahun/bln/hr, tampil jam saja (skip menit/detik biar ringkas)
  if (years || months || days) {
    if (hours) parts.push(`${hours} jam`);
    return parts.join(" ");
  }
  // Di bawah 1 hari: format lengkap
  parts.push(`${String(hours).padStart(2,"0")}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`);
  return parts.join(" ");
}

/** Label tanggal rilis Indonesia: "26 Juli 2026" atau "Senin, 26 Jul 2026". */
const ID_MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const ID_MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const ID_DAYS = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

export function formatIndonesianDate(input: { unix?: number | null; ymd?: { year: number; month: number; day: number } | null }, withDay = true): string {
  let d: Date | null = null;
  if (input.unix) d = new Date(input.unix * 1000);
  else if (input.ymd?.year) d = new Date(input.ymd.year, (input.ymd.month ?? 1) - 1, input.ymd.day ?? 1);
  if (!d || isNaN(d.getTime())) return "?";
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = ID_MONTHS_SHORT[d.getMonth()];
  const yyyy = d.getFullYear();
  return withDay ? `${ID_DAYS[d.getDay()]}, ${dd} ${mm} ${yyyy}` : `${dd} ${mm} ${yyyy}`;
}

export function formatIndonesianDateLong(input: { unix?: number | null; ymd?: { year: number; month: number; day: number } | null }): string {
  let d: Date | null = null;
  if (input.unix) d = new Date(input.unix * 1000);
  else if (input.ymd?.year) d = new Date(input.ymd.year, (input.ymd.month ?? 1) - 1, input.ymd.day ?? 1);
  if (!d || isNaN(d.getTime())) return "?";
  return `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export async function searchAniList(
  term: string,
  page = 1
): Promise<{ list: AniListAnime[]; hasNextPage: boolean }> {
  const safe = term.replace(/"/g, "");
  const q = `{
    Page(page: ${page}, perPage: 24) {
      pageInfo { hasNextPage }
      media(type: ANIME, search: "${safe}", sort: POPULARITY_DESC) { ${ANIME_FIELDS} }
    }
  }`;
  const json = (await anilistQuery(q)) as { data: { Page: { pageInfo: { hasNextPage: boolean }; media: AniListAnime[] } } };
  return {
    list: json.data?.Page?.media ?? [],
    hasNextPage: json.data?.Page?.pageInfo?.hasNextPage ?? false,
  };
}

export const STREAMING_PLATFORMS = ["Crunchyroll", "Netflix", "Disney+", "YouTube", "Amazon", "HIDIVE", "Funimation", "Bilibili"];

export const PLATFORM_STYLE: Record<string, { bg: string; color: string; emoji: string }> = {
  Crunchyroll:  { bg: "rgba(244,117,33,0.15)",  color: "#F47521", emoji: "🟠" },
  Netflix:      { bg: "rgba(229,9,20,0.15)",     color: "#E50914", emoji: "🔴" },
  "Disney+":    { bg: "rgba(17,60,207,0.15)",    color: "#6B9FFF", emoji: "🔵" },
  YouTube:      { bg: "rgba(255,0,0,0.12)",      color: "#FF4444", emoji: "▶️" },
  Amazon:       { bg: "rgba(0,168,224,0.12)",    color: "#00A8E0", emoji: "📦" },
  HIDIVE:       { bg: "rgba(167,139,250,0.15)",  color: "#A78BFA", emoji: "🟣" },
  Funimation:   { bg: "rgba(99,102,241,0.12)",   color: "#818CF8", emoji: "🎌" },
  Bilibili:     { bg: "rgba(0,161,214,0.12)",    color: "#00A1D6", emoji: "📺" },
};

export function getStreamingLinks(anime: AniListAnime) {
  return (anime.externalLinks ?? []).filter((l) => STREAMING_PLATFORMS.includes(l.site));
}

export function getYouTubeTrailerEmbed(anime: AniListAnime): string | null {
  if (anime.trailer?.site === "youtube" && anime.trailer.id) {
    return `https://www.youtube.com/embed/${anime.trailer.id}?autoplay=0&rel=0`;
  }
  return null;
}

export function formatTimeUntilAiring(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}h ${h}j lagi`;
  if (h > 0) return `${h}j lagi`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${m}m lagi`;
}

export function getTitle(anime: AniListAnime): string {
  return anime.title.english || anime.title.romaji;
}

export function cleanDescription(raw?: string | null): string {
  if (!raw) return "";
  return raw.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

// ── Banner & MAL ID lookup ────────────────────────────────────────────────────
const BANNER_CACHE_KEY = "anisub_banner_v3";
// IndexedDB key prefix — setiap entry disimpan terpisah (bukan satu blob besar),
// unlimited kapasitas, permanent. Ini menggantikan ketergantungan pada localStorage
// yang hanya 5-10MB dan gagal silent kalau penuh.
const BANNER_IDB_PREFIX = "banner_v4:";

export interface BannerCacheEntry {
  banner: string | null;
  cover: string | null;
  idMal: number | null;
  currentEp?: number | null;
  format?: string | null;
  /** Absolute Unix timestamp (seconds) when the next episode airs, from AniList nextAiringEpisode. */
  nextAiringAt?: number | null;
  /** Year the anime started airing (seasonYear from AniList). */
  seasonYear?: number | null;
  /** AniList averageScore (0–100). Divide by 10 for display (e.g. 83 → 8.3). */
  averageScore?: number | null;
}

const bannerMem = new Map<string, BannerCacheEntry>();

/** Synchronous getter — reads in-memory then localStorage, no fetch. Used by hooks to init state instantly. */
export function getCachedBanner(rawTitle: string): BannerCacheEntry | null {
  const title = cleanAnimeTitle(rawTitle);
  if (!title) return null;
  const key = `${title.toLowerCase()}::s${parseSeasonNumber(rawTitle)}`;
  if (bannerMem.has(key)) return bannerMem.get(key)!;
  try {
    const stored = JSON.parse(localStorage.getItem(BANNER_CACHE_KEY) ?? "{}") as Record<string, BannerCacheEntry>;
    if (stored[key]) { bannerMem.set(key, stored[key]); return stored[key]; }
  } catch {}
  return null;
}

/** Cek apakah banner SUDAH ada di memory (hasil preload dari IndexedDB).
 *  Dipakai prefetch service untuk skip anime yang sudah ter-cache. */
export function isBannerCachedSync(rawTitle: string): boolean {
  const title = cleanAnimeTitle(rawTitle);
  if (!title) return false;
  const key = `${title.toLowerCase()}::s${parseSeasonNumber(rawTitle)}`;
  return bannerMem.has(key);
}

/** Preload SEMUA entry banner dari IndexedDB ke in-memory bannerMem.
 *  Dipanggil satu kali saat app start — sesudahnya getCachedBanner() selalu hit memory,
 *  sehingga SmartPoster/useBanner render instan tanpa nunggu IndexedDB async. */
let _bannerPreloaded = false;
export async function preloadBannerCache(): Promise<void> {
  if (_bannerPreloaded) return;
  _bannerPreloaded = true;
  try {
    const allKeys = await idbCacheKeys();
    const bannerKeys = (allKeys as string[]).filter(
      (k) => typeof k === "string" && k.startsWith(BANNER_IDB_PREFIX)
    );
    await Promise.all(
      bannerKeys.map(async (k) => {
        const entry = await idbCacheGet<BannerCacheEntry>(k, /* permanent=always fresh */ Infinity);
        if (entry) bannerMem.set(k.slice(BANNER_IDB_PREFIX.length), entry);
      })
    );
  } catch { /* not critical — kalau gagal, banner di-fetch on-demand seperti biasa */ }
}

export function cleanAnimeTitle(raw: string): string {
  return raw
    .replace(/\s+Subtitle\s+Indonesia/i, "")
    .replace(/\s+Sub\s+Indo/i, "")
    .replace(/\s+\(End\)/i, "")
    .replace(/\s+Episode\s+\d+/i, "")
    // Cuma strip "Season 1" / "Part 1" — season 2+ WAJIB dipertahankan di search term,
    // supaya AniList nggak salah cocokin ke Season 1-nya (search term jadi ambigu kalau dihapus).
    .replace(/\s+Season\s+1\b/i, "")
    .replace(/\s+Part\s+1\b/i, "")
    .trim();
}

/** Ekstrak nomor season dari judul mentah (scraped dari OtakuDesu), buat dipakai
 *  mencocokkan hasil pencarian AniList ke season yang benar. Default 1 kalau nggak ketemu pola apa pun. */
export function parseSeasonNumber(raw: string): number {
  const numericPatterns: RegExp[] = [
    /season\s+(\d+)/i,
    /(\d+)(?:st|nd|rd|th)\s+season/i,
    /\bs(\d+)\b/i,
    /\bpart\s+(\d+)/i,
    /\bcour\s+(\d+)/i,
  ];
  for (const re of numericPatterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  }
  const romanMap: Record<string, number> = {
    ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  };
  const romanMatch = raw.trim().match(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/i);
  if (romanMatch?.[1]) {
    const n = romanMap[romanMatch[1].toLowerCase()];
    if (n) return n;
  }
  return 1;
}

function candidateTitleText(c: { title?: { romaji?: string | null; english?: string | null; native?: string | null } | null }): string {
  return c.title?.english || c.title?.romaji || c.title?.native || "";
}

/** TV-format formats — prioritaskan di atas Movie/OVA/ONA/Special biar poster nggak ketuker. */
const TV_FORMATS = new Set(["TV", "TV_SHORT"]);

/** Pilih kandidat AniList yang season-nya paling cocok sama judul mentah lokal (dari OtakuDesu).
 *  Urutan prioritas:
 *  1. Format TV + season match
 *  2. Format TV saja (tanpa season match) → fallback ke yg paling populer di TV
 *  3. Kandidat pertama apa pun (SEARCH_MATCH terbaik)
 *  Ini mencegah poster Movie/OVA muncul untuk anime TV multi-season. */
function pickBestSeasonMatch<T extends {
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  format?: string | null;
}>(
  candidates: T[],
  targetSeason: number
): T | null {
  if (!candidates.length) return null;

  const tvOnly = candidates.filter((c) => !c.format || TV_FORMATS.has(c.format ?? ""));

  // 1. TV + season cocok persis
  const tvSeasonExact = tvOnly.find((c) => parseSeasonNumber(candidateTitleText(c)) === targetSeason);
  if (tvSeasonExact) return tvSeasonExact;

  // 2. Kalau target season = 1, ambil TV pertama (season 1 biasanya nggak ada angka di judulnya)
  if (targetSeason === 1 && tvOnly.length > 0) return tvOnly[0];

  // 3. Any season match (termasuk Movie/OVA — last resort)
  const anySeasonExact = candidates.find((c) => parseSeasonNumber(candidateTitleText(c)) === targetSeason);
  if (anySeasonExact) return anySeasonExact;

  // 4. Fallback ke kandidat TV pertama, atau kandidat pertama jika tak ada TV
  return tvOnly[0] ?? candidates[0] ?? null;
}

// ── Rich AniList data (detail page) ──────────────────────────────────────────
export interface AniListRichData {
  id: number;
  idMal?: number | null;
  bannerImage?: string | null;
  format?: string | null;
  trailer?: { id: string; site: string } | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  endDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  popularity?: number | null;
  studios?: { nodes: { name: string; isAnimationStudio: boolean }[] };
  staff?: {
    edges: { role: string; node: { id: number; name: { full: string }; image: { medium: string | null } | null } }[];
  };
  characters?: {
    edges: {
      role: string;
      node: { id: number; name: { full: string }; image: { medium: string | null } | null; gender?: string | null };
      voiceActors: { id: number; name: { full: string }; image: { medium: string | null } | null }[];
    }[];
  };
  airingSchedule?: { nodes: { episode: number; airingAt: number }[] };
  relations?: {
    edges: {
      relationType: string;
      node: {
        id: number;
        type?: string | null;
        format?: string | null;
        title: { romaji: string; english?: string | null; native?: string | null };
        coverImage: { medium: string };
      };
    }[];
  };
}

/* ── Person Detail (Staff / Character / VA) ─────────────────────────────── */

export interface PersonDetail {
  id: number;
  type: "staff" | "character";
  name: { full: string; native?: string | null };
  image: { large?: string | null; medium?: string | null };
  description?: string | null;
  primaryOccupations?: string[];
  dateOfBirth?: { year?: number | null; month?: number | null; day?: number | null } | null;
  age?: number | null;
  gender?: string | null;
  yearsActive?: number[];
  homeTown?: string | null;
  languageV2?: string | null;
  // For characters
  bloodType?: string | null;
  anime?: { id: number; title: string; image: string }[];
}

const PERSON_MEM: Map<string, PersonDetail> = new Map();

/** Sync getter — baca dari in-memory map tanpa async/IDB.
 *  Dipakai sebagai `initialData` di useQuery PersonModal agar skeleton tidak muncul
 *  kalau data sudah ada di memori (sudah pernah diklik di sesi ini). */
export function getPersonMemSync(id: number, type: "staff" | "character"): PersonDetail | undefined {
  return PERSON_MEM.get(`${type}:${id}`);
}
// Bio/foto staff & karakter praktis tidak pernah berubah setelah AniList punya datanya →
// begitu berhasil di-fetch, simpan permanen di IndexedDB (tidak pernah re-fetch lagi).
const PERSON_TTL = 24 * 3600_000; // fallback TTL kalau entry lama (localStorage) belum permanent

function cleanMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // [text](url) → text
    .replace(/__([^_]+)__/g, "$1")              // __bold__ → bold
    .replace(/_([^_]+)_/g, "$1")               // _italic_ → italic
    .replace(/\*\*([^*]+)\*\*/g, "$1")         // **bold** → bold
    .replace(/\*([^*]+)\*/g, "$1")             // *italic* → italic
    .replace(/^#{1,6}\s+/gm, "")              // # headers
    .replace(/`([^`]+)`/g, "$1")              // `code` → code
    .replace(/~([^~]+)~/g, "$1")             // ~strikethrough~
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(raw?: string | null): string {
  if (!raw) return "";
  const stripped = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleanMarkdown(stripped);
}

// ── Server-side Bio Cache ────────────────────────────────────────────────
// Bio di-fetch server-side (Wikipedia ID → EN → AniList) dan di-cache di server.
// Client hanya baca dari API endpoint — tidak ada pencarian Wikipedia client-side.
const BIO_ID_MEM = new Map<string, string>();
const BIO_ID_CACHE_KEY = "anisub_bio_id_v3";
const BIO_ID_TTL = 24 * 3600_000; // 1 hari

/** Ambil extract singkat dari Wikipedia (ID atau EN) untuk nama orang tertentu.
 *  Wikipedia API mendukung CORS penuh dengan parameter origin=*. */
async function fetchWikiExtract(name: string, lang: "id" | "en"): Promise<string> {
  const url = `https://${lang}.wikipedia.org/w/api.php?` +
    `action=query&titles=${encodeURIComponent(name)}&prop=extracts&exintro=true` +
    `&explaintext=true&format=json&origin=*&redirects=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return "";
  const json = await res.json() as {
    query?: { pages?: Record<string, { extract?: string; missing?: number }> }
  };
  const pages = Object.values(json.query?.pages ?? {});
  const page = pages[0];
  if (!page || ("missing" in page)) return "";
  const text = (page.extract ?? "").trim();
  return text.length >= 80 ? text : "";
}

function saveBioCache(k: string, text: string) {
  BIO_ID_MEM.set(k, text);
  // Bio Wikipedia/AniList untuk orang yang sama praktis tidak pernah berubah → permanent.
  idbCacheSet(`${BIO_ID_CACHE_KEY}:${k}`, text, { permanent: true }).catch(() => {});
}

export async function fetchPersonBioId(name: string, fallback?: string): Promise<string> {
  const k = name.toLowerCase().trim();

  // 1. Cek mem cache
  const memVal = BIO_ID_MEM.get(k);
  if (memVal) return memVal;

  // 2. Cek IndexedDB cache (permanent, unlimited kapasitas)
  const hit = await idbCacheGet<string>(`${BIO_ID_CACHE_KEY}:${k}`, BIO_ID_TTL);
  if (hit) { BIO_ID_MEM.set(k, hit); return hit; }

  // 3. Wikipedia Indonesia (bahasa Indonesia)
  try {
    const idText = await fetchWikiExtract(name, "id");
    if (idText) { saveBioCache(k, idText); return idText; }
  } catch {}

  // 4. Wikipedia English (fallback)
  try {
    const enText = await fetchWikiExtract(name, "en");
    if (enText) { saveBioCache(k, enText); return enText; }
  } catch {}

  // 5. AniList description (last resort, tidak di-cache agar Wikipedia bisa dicoba ulang)
  return fallback ? cleanMarkdown(fallback) : "";
}

export async function fetchPersonDetail(id: number, type: "staff" | "character"): Promise<PersonDetail | null> {
  const key = `${type}:${id}`;
  if (PERSON_MEM.has(key)) return PERSON_MEM.get(key)!;

  // Cek IndexedDB (permanent) — bio/foto staff & karakter praktis tidak pernah berubah.
  const cached = await idbCacheGet<PersonDetail>(`anisub_person_v1:${key}`, PERSON_TTL);
  if (cached) { PERSON_MEM.set(key, cached); return cached; }

  try {
    let q: string;
    if (type === "staff") {
      q = `{
        Staff(id: ${id}) {
          id name { full native }
          image { large medium }
          description(asHtml: false)
          primaryOccupations
          dateOfBirth { year month day }
          age gender yearsActive homeTown
          languageV2
          staffMedia(perPage: 12, sort: POPULARITY_DESC, type: ANIME) {
            edges { staffRole node { id title { romaji } coverImage { medium } } }
          }
        }
      }`;
    } else {
      q = `{
        Character(id: ${id}) {
          id name { full native }
          image { large medium }
          description(asHtml: false)
          gender dateOfBirth { year month day } age bloodType
          media(perPage: 10, sort: POPULARITY_DESC, type: ANIME) {
            edges { node { id title { romaji } coverImage { medium } } }
          }
        }
      }`;
    }

    // 'high' priority — dipanggil saat user klik staff/VA di halaman detail,
    // jadi request ini harus loncat ke depan antrian melewati prefetch background.
    const json = await anilistQuery(q, 'high') as { data?: { Staff?: unknown; Character?: unknown } };
    const raw = (type === "staff" ? json.data?.Staff : json.data?.Character) as Record<string, unknown> | undefined;
    if (!raw) return null;

    let anime: { id: number; title: string; image: string }[] | undefined;
    if (type === "staff") {
      const staffMedia = raw.staffMedia as { edges?: { staffRole: string; node: { id: number; title: { romaji: string }; coverImage: { medium: string } } }[] } | undefined;
      anime = staffMedia?.edges?.map(e => ({ id: e.node.id, title: e.node.title.romaji, image: e.node.coverImage.medium })) ?? [];
    } else {
      const media = raw.media as { edges?: { node: { id: number; title: { romaji: string }; coverImage: { medium: string } } }[] } | undefined;
      anime = media?.edges?.map(e => ({ id: e.node.id, title: e.node.title.romaji, image: e.node.coverImage.medium })) ?? [];
    }

    const result: PersonDetail = {
      id,
      type,
      name: raw.name as PersonDetail["name"],
      image: raw.image as PersonDetail["image"],
      description: stripHtml(raw.description as string | null),
      primaryOccupations: raw.primaryOccupations as string[] | undefined,
      dateOfBirth: raw.dateOfBirth as PersonDetail["dateOfBirth"],
      age: raw.age as number | null,
      gender: raw.gender as string | null,
      yearsActive: raw.yearsActive as number[] | undefined,
      homeTown: raw.homeTown as string | null,
      languageV2: raw.languageV2 as string | null,
      bloodType: raw.bloodType as string | null,
      anime,
    };

    PERSON_MEM.set(key, result);
    idbCacheSet(`anisub_person_v1:${key}`, result, { permanent: true }).catch(() => {});
    return result;
  } catch {
    return null;
  }
}

const RICH_CACHE_KEY = "anisub_rich_v2";
const richMem = new Map<string, AniListRichData>();
const RICH_TTL = 30 * 24 * 3600_000; // 30 hari — dipakai untuk data yang BELUM lengkap

// Cache "tidak ditemukan di AniList" supaya kita tidak terus-terusan hit AniList
// untuk anime yang memang tidak punya data. TTL pendek = coba lagi setelah 30 menit.
const RICH_NULL_CACHE_KEY = "anisub_rich_null_v1";
const RICH_NULL_TTL = 30 * 60_000; // 30 menit

/**
 * Anime dianggap "lengkap" kalau sudah punya staff + minimal satu karakter dengan pengisi
 * suaranya. Data lengkap → di-cache PERMANEN (tidak pernah di-fetch ulang lagi), karena
 * data ini praktis tidak berubah lagi. Trailer & banner ikut terbawa di response yang sama —
 * kalau memang AniList tidak punya bannerImage (banyak anime baru belum di-upload banner-nya
 * oleh AniList), itu jawaban final juga, BUKAN alasan buat dianggap "belum lengkap" dan
 * di-fetch ulang terus — kalau dipaksa syarat banner, anime yang datanya sebenarnya sudah
 * lengkap (staff+karakter+VA) tapi memang tidak punya banner di AniList tidak akan pernah
 * ke-cache permanen, padahal tidak ada gunanya di-fetch ulang lagi.
 * Anime yang belum lengkap (misal AniList belum ada data staff/karakternya sama sekali)
 * tetap dicoba ulang tiap 30 hari (RICH_TTL) supaya begitu datanya muncul, langsung permanen.
 */
export function isRichDataComplete(data: AniListRichData): boolean {
  const hasStaff = (data.staff?.edges?.length ?? 0) > 0;
  const hasCharVA = (data.characters?.edges ?? []).some((e) => (e.voiceActors?.length ?? 0) > 0);
  return hasStaff && hasCharVA;
}

/**
 * Hapus SEMUA layer cache untuk satu anime agar next call ke
 * fetchAniListRichByTitle pasti melakukan network request fresh.
 * Dipanggil dari tombol "Coba Lagi" / "Muat Ulang" di AnimeDetail.
 */
export async function clearRichCache(rawTitle: string): Promise<void> {
  const title = cleanAnimeTitle(rawTitle);
  if (!title) return;
  const targetSeason = parseSeasonNumber(rawTitle);
  const key = `${title.toLowerCase()}::s${targetSeason}`;

  // 1. In-memory cache
  richMem.delete(key);

  // 2. localStorage null-result cache
  try {
    const nullCache = JSON.parse(localStorage.getItem(RICH_NULL_CACHE_KEY) ?? "{}") as Record<string, number>;
    delete nullCache[key];
    localStorage.setItem(RICH_NULL_CACHE_KEY, JSON.stringify(nullCache));
  } catch {}

  // 3. IndexedDB cache (async, fire-and-forget ok)
  idbCacheDel(`${RICH_CACHE_KEY}:${key}`).catch(() => {});
}

export async function fetchAniListRichByTitle(rawTitle: string, priority: 'high' | 'low' = 'low'): Promise<AniListRichData | null> {
  const title = cleanAnimeTitle(rawTitle);
  if (!title) return null;
  const targetSeason = parseSeasonNumber(rawTitle);
  // Season disematkan di cache key biar "Anime Season 1" dan "Anime Season 3" gak saling
  // menimpa cache satu sama lain walau title dasarnya sama.
  const key = `${title.toLowerCase()}::s${targetSeason}`;

  if (richMem.has(key)) return richMem.get(key)!;

  // Cek cache di IndexedDB — permanent kalau datanya sudah lengkap, kalau belum pakai RICH_TTL.
  const cached = await idbCacheGet<AniListRichData>(`${RICH_CACHE_KEY}:${key}`, RICH_TTL);
  if (cached) {
    richMem.set(key, cached);
    return cached;
  }

  // Cek cache "tidak ditemukan" (30 menit) — hindari hammering AniList berulang
  try {
    const nullCache = JSON.parse(localStorage.getItem(RICH_NULL_CACHE_KEY) ?? "{}") as Record<string, number>;
    if (nullCache[key] && Date.now() - nullCache[key] < RICH_NULL_TTL) {
      return null;
    }
  } catch {}

  const RICH_QUERY_FIELDS = `
    id idMal bannerImage format
    title { romaji english native }
    trailer { id site }
    startDate { year month day }
    endDate { year month day }
    status season seasonYear popularity
    studios(isMain: true) { nodes { name isAnimationStudio } }
    staff(sort: RELEVANCE, perPage: 12) {
      edges { role node { id name { full } image { medium } } }
    }
    characters(sort: [ROLE, RELEVANCE], perPage: 25) {
      edges {
        role
        node { id name { full } image { medium } gender }
        voiceActors(language: JAPANESE) { id name { full } image { medium } }
      }
    }
    airingSchedule(notYetAired: false, perPage: 50) {
      nodes { episode airingAt }
    }
    relations {
      edges {
        relationType(version: 2)
        node {
          id type format
          title { romaji english native }
          coverImage { medium }
        }
      }
    }
  `;

  type RichCandidate = AniListRichData & { title?: { romaji?: string | null; english?: string | null; native?: string | null } | null };

  // Gunakan anilistQuery (retry 6× + handle 429 Retry-After) bukan raw fetch
  // Priority diwariskan dari caller: 'high' saat user buka halaman, 'low' saat background.
  async function searchRichByTerm(term: string): Promise<RichCandidate[]> {
    const safe = term.replace(/"/g, "");
    const q = `{ Page(perPage: 6) { media(type: ANIME, search: "${safe}", sort: SEARCH_MATCH) { ${RICH_QUERY_FIELDS} } } }`;
    const json = await anilistQuery(q, priority) as { data?: { Page?: { media?: RichCandidate[] } } };
    return json.data?.Page?.media ?? [];
  }

  try {
    let candidates = await searchRichByTerm(title);

    // Fallback 1: strip parentheticals and trailing subtitle (after colon)
    if (candidates.length === 0) {
      const stripped = title.replace(/\s*\([^)]*\)/g, "").replace(/\s*:.*$/, "").trim();
      if (stripped && stripped !== title) candidates = await searchRichByTerm(stripped);
    }

    // Fallback 2: first 4 words (handles long subtitles)
    if (candidates.length === 0) {
      const words = title.split(/\s+/);
      const firstWords = words.slice(0, 4).join(" ");
      if (firstWords && firstWords !== title) candidates = await searchRichByTerm(firstWords);
    }

    // Fallback 3: first 3 words
    if (candidates.length === 0) {
      const words = title.split(/\s+/);
      const first3 = words.slice(0, 3).join(" ");
      if (first3 && first3 !== title) candidates = await searchRichByTerm(first3);
    }

    // Fallback 4: strip all non-alphanumeric/space (handles special chars in titles)
    if (candidates.length === 0) {
      const alphOnly = title.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
      if (alphOnly && alphOnly !== title) candidates = await searchRichByTerm(alphOnly);
    }

    // Fallback 5: first 2 meaningful words (very short query for very long/unusual titles)
    if (candidates.length === 0) {
      const meaningfulWords = title.split(/\s+/).filter(w => w.length > 2);
      const first2 = meaningfulWords.slice(0, 2).join(" ");
      if (first2 && first2.length >= 4) candidates = await searchRichByTerm(first2);
    }

    const media = pickBestSeasonMatch(candidates, targetSeason);
    if (!media) {
      // AniList genuinely has no match — cache agar tidak retry terus-terusan
      try {
        const nullCache = JSON.parse(localStorage.getItem(RICH_NULL_CACHE_KEY) ?? "{}") as Record<string, number>;
        nullCache[key] = Date.now();
        localStorage.setItem(RICH_NULL_CACHE_KEY, JSON.stringify(nullCache));
      } catch {}
      return null;
    }
    const { title: _discard, ...rest } = media;
    const result = { ...rest, __ts: Date.now() } as AniListRichData;
    richMem.set(key, result);
    // Simpan permanen di IndexedDB kalau datanya sudah lengkap (poster+staff+karakter&VA),
    // kalau belum lengkap simpan dengan TTL 30 hari supaya dicoba lagi nanti.
    idbCacheSet(`${RICH_CACHE_KEY}:${key}`, result, { permanent: isRichDataComplete(result) }).catch(() => {});
    return result;
  } catch (e) {
    // Network / rate-limit failure — lempar error supaya React Query tahu perlu retry
    throw e;
  }
}

export async function fetchAniListBannerByTitle(rawTitle: string): Promise<BannerCacheEntry> {
  const title = cleanAnimeTitle(rawTitle);
  if (!title) return { banner: null, cover: null, idMal: null, currentEp: null, format: null };
  const targetSeason = parseSeasonNumber(rawTitle);
  const key = `${title.toLowerCase()}::s${targetSeason}`;

  // 1. Memory (fastest — preloaded from IDB at startup)
  if (bannerMem.has(key)) return bannerMem.get(key)!;

  // 2. localStorage (sync, backward compat)
  try {
    const stored: Record<string, BannerCacheEntry> = JSON.parse(
      localStorage.getItem(BANNER_CACHE_KEY) ?? "{}"
    );
    if (stored[key]) {
      bannerMem.set(key, stored[key]);
      // Migrate ke IDB supaya tersimpan permanen, tidak ada quota limit
      idbCacheSet(`${BANNER_IDB_PREFIX}${key}`, stored[key], { permanent: true }).catch(() => {});
      return stored[key];
    }
  } catch {}

  // 3. IndexedDB (permanent, individual key — tidak kena quota limit localStorage)
  try {
    const idbHit = await idbCacheGet<BannerCacheEntry>(`${BANNER_IDB_PREFIX}${key}`, Infinity);
    if (idbHit) {
      bannerMem.set(key, idbHit);
      return idbHit;
    }
  } catch {}

  try {
    const safe = title.replace(/"/g, "");
    const q = `{
      Page(perPage: 8) {
        media(type: ANIME, search: "${safe}", sort: SEARCH_MATCH) {
          idMal bannerImage coverImage { extraLarge }
          title { romaji english native }
          format
          episodes
          seasonYear
          averageScore
          nextAiringEpisode { episode timeUntilAiring }
        }
      }
    }`;
    // Dulu raw fetch() langsung — di halaman Home/Schedule dengan 30-50+ card sekaligus,
    // semuanya nembak paralel tanpa antrian dan langsung kena 429 AniList (badge jadi
    // fallback kurang akurat). Sekarang lewat anilistQuery yang sama: antrian + retry 6x
    // + hormat 429 global, konsisten dengan semua request AniList lainnya di file ini.
    const json = await anilistQuery(q) as {
      data?: {
        Page?: {
          media?: {
            idMal?: number | null;
            bannerImage?: string | null;
            coverImage?: { extraLarge?: string | null };
            title?: { romaji?: string | null; english?: string | null; native?: string | null };
            format?: string | null;
            episodes?: number | null;
            seasonYear?: number | null;
            averageScore?: number | null;
            nextAiringEpisode?: { episode: number; timeUntilAiring: number } | null;
          }[];
        };
      };
    };
    const candidates = json.data?.Page?.media ?? [];
    const media = pickBestSeasonMatch(candidates, targetSeason);

    // currentEp: kalau masih airing, nextAiringEpisode.episode - 1 = episode terakhir tayang
    //            kalau sudah tamat, gunakan total episodes
    let currentEp: number | null = null;
    if (media?.nextAiringEpisode?.episode) {
      currentEp = media.nextAiringEpisode.episode - 1;
    } else if (media?.episodes) {
      currentEp = media.episodes;
    }

    // nextAiringAt: absolute Unix timestamp (seconds) saat eps berikutnya tayang
    const nextAiringAt: number | null =
      media?.nextAiringEpisode?.timeUntilAiring != null
        ? Math.floor(Date.now() / 1000) + media.nextAiringEpisode.timeUntilAiring
        : null;

    const result: BannerCacheEntry = {
      banner: media?.bannerImage ?? null,
      cover: media?.coverImage?.extraLarge ?? null,
      idMal: media?.idMal ?? null,
      currentEp,
      format: media?.format ?? null,
      nextAiringAt,
      seasonYear: media?.seasonYear ?? null,
      averageScore: media?.averageScore ?? null,
    };
    bannerMem.set(key, result);
    // Simpan ke IDB (individual key, permanent, no quota limit) — primary persistence
    idbCacheSet(`${BANNER_IDB_PREFIX}${key}`, result, { permanent: true }).catch(() => {});
    // Simpan ke localStorage juga (backward compat, fast sync read on next getCachedBanner call)
    try {
      const stored: Record<string, BannerCacheEntry> = JSON.parse(localStorage.getItem(BANNER_CACHE_KEY) ?? "{}");
      stored[key] = result;
      localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify(stored));
    } catch {}
    return result;
  } catch {
    return { banner: null, cover: null, idMal: null, currentEp: null, format: null };
  }
}

// ── Batch banner fetch — N judul dalam SATU request GraphQL ─────────────────
// AniList membatasi RATE (request/menit), bukan ukuran satu query. Fase 1 prefetch
// tadinya 1 request per judul (1854 anime = 1854 request, ~350ms+RTT tiap request
// via antrian = puluhan menit). Dengan alias GraphQL, N judul bisa digabung jadi
// SATU request — total request turun ~Nx, jadi total waktu prefetch juga turun ~Nx,
// TANPA melanggar rate limit (tetap 1 request pada satu waktu lewat antrian yang sama).
const BANNER_BATCH_SIZE = 8;

function buildBannerBatchQuery(safeTitles: string[]): string {
  const blocks = safeTitles.map((t, i) => `
    b${i}: Page(perPage: 8) {
      media(type: ANIME, search: "${t}", sort: SEARCH_MATCH) {
        idMal bannerImage coverImage { extraLarge }
        title { romaji english native }
        format episodes seasonYear averageScore
        nextAiringEpisode { episode timeUntilAiring }
      }
    }`).join("\n");
  return `{ ${blocks} }`;
}

/** Fetch banner untuk BANYAK judul sekaligus, digabung jadi satu request GraphQL
 *  (alias per judul). Mengembalikan Map rawTitle -> BannerCacheEntry untuk yang
 *  berhasil di-resolve (judul yang sudah di-cache SEBELUMNYA tidak dimasukkan ke
 *  request, cukup dibaca dari cache seperti biasa oleh caller). */
// ── Micro-batch scheduler untuk fetch on-demand (kartu yang sedang terlihat user) ──
// Sebelumnya tiap kartu poster manggil 1 request AniList sendiri-sendiri (walau lewat
// antrian bersama) — untuk 20-30 kartu yang mount hampir bersamaan di Home, itu 20-30
// request serial @350ms = puluhan detik. Sekarang request-request yang datang dalam
// jendela waktu singkat (~40ms, cukup untuk semua kartu di satu render) digabung jadi
// SATU (atau sedikit) request GraphQL ber-alias via fetchAniListBannersBatch, dengan
// priority 'high' supaya tidak antre di belakang background prefetch. Hasilnya: seluruh
// kartu yang tampil sekaligus selesai dalam hitungan detik, bukan puluhan detik.
const _pendingTitles = new Map<string, Array<(v: BannerCacheEntry) => void>>();
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const MICRO_BATCH_WINDOW_MS = 40;
const MICRO_BATCH_SIZE = 8;

function _scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    const titles = Array.from(_pendingTitles.keys());
    while (titles.length > 0) {
      const chunk = titles.splice(0, MICRO_BATCH_SIZE);
      fetchAniListBannersBatch(chunk, 'high')
        .then((results) => {
          for (const t of chunk) {
            const entry = results.get(t) ?? { banner: null, cover: null, idMal: null, currentEp: null, format: null };
            const resolvers = _pendingTitles.get(t) ?? [];
            _pendingTitles.delete(t);
            resolvers.forEach((r) => r(entry));
          }
        })
        .catch(() => {
          for (const t of chunk) {
            const resolvers = _pendingTitles.get(t) ?? [];
            _pendingTitles.delete(t);
            resolvers.forEach((r) => r({ banner: null, cover: null, idMal: null, currentEp: null, format: null }));
          }
        });
    }
  }, MICRO_BATCH_WINDOW_MS);
}

/** On-demand fetch (dipakai kartu yang sedang terlihat) — micro-batched + priority 'high'. */
export function fetchAniListBannerOnDemand(rawTitle: string): Promise<BannerCacheEntry> {
  const cached = getCachedBanner(rawTitle);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const list = _pendingTitles.get(rawTitle) ?? [];
    list.push(resolve);
    _pendingTitles.set(rawTitle, list);
    _scheduleFlush();
  });
}

export async function fetchAniListBannersBatch(rawTitles: string[], priority: 'high' | 'low' = 'low'): Promise<Map<string, BannerCacheEntry>> {
  const results = new Map<string, BannerCacheEntry>();
  if (rawTitles.length === 0) return results;

  // Judul unik per key cache — hindari fetch dobel kalau ada duplikat/variasi kecil.
  const jobs = rawTitles.map((rawTitle) => {
    const title = cleanAnimeTitle(rawTitle);
    const targetSeason = parseSeasonNumber(rawTitle);
    const key = title ? `${title.toLowerCase()}::s${targetSeason}` : "";
    return { rawTitle, title, targetSeason, key, safe: title.replace(/"/g, "") };
  }).filter((j) => j.title);

  const q = buildBannerBatchQuery(jobs.map((j) => j.safe));

  try {
    const json = await anilistQuery(q, priority) as { data?: Record<string, { media?: unknown[] } | null> };
    const data = json.data ?? {};

    jobs.forEach((job, i) => {
      const page = data[`b${i}`];
      const candidates = (page?.media ?? []) as {
        idMal?: number | null;
        bannerImage?: string | null;
        coverImage?: { extraLarge?: string | null };
        title?: { romaji?: string | null; english?: string | null; native?: string | null };
        format?: string | null;
        episodes?: number | null;
        seasonYear?: number | null;
        averageScore?: number | null;
        nextAiringEpisode?: { episode: number; timeUntilAiring: number } | null;
      }[];
      const media = pickBestSeasonMatch(candidates, job.targetSeason);

      let currentEp: number | null = null;
      if (media?.nextAiringEpisode?.episode) currentEp = media.nextAiringEpisode.episode - 1;
      else if (media?.episodes) currentEp = media.episodes;

      const nextAiringAt: number | null =
        media?.nextAiringEpisode?.timeUntilAiring != null
          ? Math.floor(Date.now() / 1000) + media.nextAiringEpisode.timeUntilAiring
          : null;

      const result: BannerCacheEntry = {
        banner: media?.bannerImage ?? null,
        cover: media?.coverImage?.extraLarge ?? null,
        idMal: media?.idMal ?? null,
        currentEp,
        format: media?.format ?? null,
        nextAiringAt,
        seasonYear: media?.seasonYear ?? null,
        averageScore: media?.averageScore ?? null,
      };

      bannerMem.set(job.key, result);
      idbCacheSet(`${BANNER_IDB_PREFIX}${job.key}`, result, { permanent: true }).catch(() => {});
      results.set(job.rawTitle, result);
    });

    // Simpan sekali ke localStorage (backward compat) — gabung semua hasil batch ini.
    try {
      const stored: Record<string, BannerCacheEntry> = JSON.parse(localStorage.getItem(BANNER_CACHE_KEY) ?? "{}");
      jobs.forEach((job) => { if (results.has(job.rawTitle)) stored[job.key] = results.get(job.rawTitle)!; });
      localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify(stored));
    } catch {}
  } catch {
    // Gagal seluruh batch (network/rate-limit) — biarkan kosong, caller akan retry batch ini nanti.
  }

  return results;
}

export interface CharacterAnimeMatch {
  characterId: number;
  characterName: string;
  characterImage?: string | null;
  animeTitle: string;
}

const CHAR_SEARCH_CACHE_KEY = "anisub_char_search_v1";
const charSearchMem = new Map<string, { data: CharacterAnimeMatch[]; ts: number }>();
const CHAR_SEARCH_TTL = 6 * 3600_000;

// Cari anime lewat nama karakter (mis. "rimuru" -> "Tensei shitara Slime Datta Ken")
export async function searchAnimeByCharacter(rawName: string): Promise<CharacterAnimeMatch[]> {
  const name = rawName.trim();
  if (name.length < 2) return [];
  const key = name.toLowerCase();

  const memHit = charSearchMem.get(key);
  if (memHit && Date.now() - memHit.ts < CHAR_SEARCH_TTL) return memHit.data;

  try {
    const stored = JSON.parse(localStorage.getItem(CHAR_SEARCH_CACHE_KEY) ?? "{}") as Record<string, { data: CharacterAnimeMatch[]; ts: number }>;
    const cached = stored[key];
    if (cached && Date.now() - cached.ts < CHAR_SEARCH_TTL) {
      charSearchMem.set(key, cached);
      return cached.data;
    }
  } catch {}

  const safe = name.replace(/"/g, "").slice(0, 50);
  const q = `{
    Page(page: 1, perPage: 6) {
      characters(search: "${safe}", sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
        id
        name { full native }
        image { medium }
        media(perPage: 3, sort: POPULARITY_DESC, type: ANIME) {
          nodes { title { romaji english } }
        }
      }
    }
  }`;

  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: q }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json() as {
      data?: {
        Page?: {
          characters?: {
            id: number;
            name?: { full?: string | null; native?: string | null };
            image?: { medium?: string | null };
            media?: { nodes?: { title?: { romaji?: string | null; english?: string | null } }[] };
          }[];
        };
      };
    };
    const chars = json.data?.Page?.characters ?? [];
    const out: CharacterAnimeMatch[] = [];
    for (const c of chars) {
      const nodes = c.media?.nodes ?? [];
      for (const n of nodes) {
        const title = n.title?.english || n.title?.romaji;
        if (!title) continue;
        out.push({
          characterId: c.id,
          characterName: c.name?.full ?? c.name?.native ?? "",
          characterImage: c.image?.medium ?? null,
          animeTitle: title,
        });
      }
    }
    charSearchMem.set(key, { data: out, ts: Date.now() });
    try {
      const stored = JSON.parse(localStorage.getItem(CHAR_SEARCH_CACHE_KEY) ?? "{}");
      stored[key] = { data: out, ts: Date.now() };
      localStorage.setItem(CHAR_SEARCH_CACHE_KEY, JSON.stringify(stored));
    } catch {}
    return out;
  } catch {
    return [];
  }
}
