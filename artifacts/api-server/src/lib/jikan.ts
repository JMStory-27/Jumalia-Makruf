/**
 * JIKAN v4 client wrapper. Polite rate-limit-aware queue + persistently
 * cached data on disk supaya page load instan tanpa hit MAL setiap request.
 *
 * JIKAN rate limits (per docs): 2 req/sec, 60 req/min. Kita pakai 600ms gap
 * + pause kalau kena 429. Cache JIKAN tidak offisial jadi TTL sendiri:
 *   - season lineup: 6 jam (lineup jarang berubah, kecuali ada pengumuman)
 *   - anime detail: 24 jam (poster/synopsis cukup stabil)
 * Disk cache di `/home/runner/workspace/.cache/jikan-*.json` -> survive restart.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { logger } from "./logger";

const JIKAN_BASE = "https://api.jikan.moe/v4";
const CACHE_DIR = "/home/runner/workspace/.cache";
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const RATE_MIN_GAP_MS = 600;       // ~1.6 req/sec (dibawah 2/sec limit)
const SEASON_TTL = 6 * 3600_000;   // 6 jam
const DETAIL_TTL = 24 * 3600_000;  // 24 jam

let _lastCallAt = 0;
let _pausedUntil = 0;

async function jikanFetch(path: string): Promise<unknown> {
  const waitResume = _pausedUntil - Date.now();
  if (waitResume > 0) await new Promise((r) => setTimeout(r, waitResume));
  const waitGap = RATE_MIN_GAP_MS - (Date.now() - _lastCallAt);
  if (waitGap > 0) await new Promise((r) => setTimeout(r, waitGap));
  _lastCallAt = Date.now();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${JIKAN_BASE}${path}`, {
        headers: { Accept: "application/json", "User-Agent": "AniSub-JIKAN/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429) {
        const ra = parseInt(res.headers.get("Retry-After") ?? "5", 10);
        _pausedUntil = Date.now() + (Number.isFinite(ra) ? ra * 1000 : 5_000);
        logger.warn({ path, pausedForMs: _pausedUntil - Date.now() }, "JIKAN 429, pausing queue");
        continue;
      }
      if (!res.ok) throw new Error(`JIKAN ${res.status} for ${path}`);
      return await res.json();
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error("JIKAN unreachable after retries");
}

// ── Types — JIKAN v4 shape (subset yang dipakai halaman Musim) ────────────────
export interface JikanSeasonAnime {
  mal_id: number;
  url: string;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  type: string | null;
  episodes: number | null;
  status: string;
  airing: boolean;
  aired: { from: string | null; to: string | null; string: string };
  duration: string | null;
  rating: string | null;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  synopsis: string | null;
  background: string | null;
  season: string | null;        // "spring"|"summer"|"fall"|"winter"
  year: number | null;
  broadcast: { day: string | null; time: string | null; timezone: string | null; string: string | null };
  producers: { mal_id: number; type: string; name: string; url?: string }[];
  studios: { mal_id: number; type: string; name: string; url?: string }[];
  genres: { mal_id: number; type: string; name: string; url?: string }[];
  themes: { mal_id: number; type: string; name: string; url?: string }[];
  demographics: { mal_id: number; type: string; name: string; url?: string }[];
  images: {
    jpg: { image_url: string; small_image_url?: string; large_image_url: string };
    webp?: { image_url: string | null; small_image_url?: string | null; large_image_url: string | null };
  };
  trailer: { youtube_id: string | null; url: string | null; embed_url: string | null; images?: { image_url: string | null; small_image_url?: string | null; medium_image_url?: string | null; large_image_url?: string | null } } | null;
}

export interface JikanCharacter {
  character: {
    mal_id: number; url: string;
    images: { jpg: { image_url: string } };
    name: string;
  };
  role: string;
  voice_actors: {
    person: { mal_id: number; url: string; images: { jpg: { image_url: string } }; name: string };
    language: string;
  }[];
}

export interface JikanStaff {
  person: { mal_id: number; url: string; images: { jpg: { image_url: string } }; name: string };
  positions: string[];
}

export interface JikanDetail extends JikanSeasonAnime {
  __characters?: JikanCharacter[];
  __staff?: JikanStaff[];
}

// ── In-memory caches ───────────────────────────────────────────────────────────
const _seasonCache = new Map<string, { data: JikanSeasonAnime[]; ts: number }>();
const _detailCache = new Map<number, { data: JikanDetail; ts: number }>();

const SEASON_DISK = `${CACHE_DIR}/jikan-seasons.json`;
const DETAIL_DISK = `${CACHE_DIR}/jikan-detail.json`;

/** Dedup JIKAN season lineup by `mal_id` — defense-in-depth: JIKAN pagination kadang kirim
 *  anime yang sama di page berbeda, dan disk cache lama mungkin sudah menulis dups
 *  sebelum helper ini ada. */
function _dedupJikanList(arr: JikanSeasonAnime[]): JikanSeasonAnime[] {
  const seen = new Set<number>();
  return arr.filter((a) => {
    if (!a.mal_id || seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
}

function loadFromDisk(): void {
  try {
    if (existsSync(SEASON_DISK)) {
      const raw = JSON.parse(readFileSync(SEASON_DISK, "utf-8")) as Record<string, { data: JikanSeasonAnime[]; ts: number }>;
      const now = Date.now();
      for (const [k, v] of Object.entries(raw)) {
        if (now - v.ts < SEASON_TTL * 4) _seasonCache.set(k, { data: _dedupJikanList(v.data), ts: v.ts });
      }
      logger.info({ count: _seasonCache.size }, "JIKAN: loaded season cache from disk (dedup'd)");
    }
    if (existsSync(DETAIL_DISK)) {
      const raw = JSON.parse(readFileSync(DETAIL_DISK, "utf-8")) as Record<string, { data: JikanDetail; ts: number }>;
      const now = Date.now();
      for (const [k, v] of Object.entries(raw)) {
        const key = Number(k);
        if (Number.isFinite(key) && now - v.ts < DETAIL_TTL * 4) _detailCache.set(key, v);
      }
      logger.info({ count: _detailCache.size }, "JIKAN: loaded detail cache from disk");
    }
  } catch (err) {
    logger.warn({ err }, "JIKAN: failed to load disk cache");
  }
}

let _persistTimer: NodeJS.Timeout | null = null;
function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      const seasonObj: Record<string, unknown> = {};
      for (const [k, v] of _seasonCache) seasonObj[k] = v;
      writeFileSync(SEASON_DISK, JSON.stringify(seasonObj));
      const detailObj: Record<string, unknown> = {};
      for (const [k, v] of _detailCache) detailObj[String(k)] = v;
      writeFileSync(DETAIL_DISK, JSON.stringify(detailObj));
      logger.debug({ seasons: _seasonCache.size, details: _detailCache.size }, "JIKAN: cache persisted to disk");
    } catch (err) {
      logger.warn({ err }, "JIKAN: failed to persist cache");
    }
  }, 5_000);
}

loadFromDisk();

// ── Public API ─────────────────────────────────────────────────────────────────
export type SeasonWord = "winter" | "spring" | "summer" | "fall";
export interface JikanSeasonKey { season: SeasonWord; year: number }

/** 4 musim ke depan dari hari ini — rotasi MAL (spring/summer/fall/winter) + carry ke tahun berikut. */
export function getUpcomingSeasons(now = new Date()): JikanSeasonKey[] {
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const cur: SeasonWord =
    m <= 3 ? "winter" : m <= 6 ? "spring" : m <= 9 ? "summer" : "fall";
  const order: SeasonWord[] = ["winter", "spring", "summer", "fall"];
  const out: JikanSeasonKey[] = [];
  let idx = order.indexOf(cur);
  let yr = y;
  for (let i = 0; i < 4; i++) {
    out.push({ season: order[idx]!, year: yr });
    if (idx === 3) { idx = 0; yr++; } else idx++;
  }
  return out;
}

/** Fetch lineup 1 musim, pagination handled otomatis (max 6 halaman × 25 = 150-anime safety).
 *  Page-level failure tidak menggagalkan keseluruhan — kalau page 4 timeout,
 *  pages 1-3 (yang sukses) tetap dipakai dan di-cache, sisanya mark "partial". */
export async function fetchJikanSeason(sk: JikanSeasonKey): Promise<JikanSeasonAnime[]> {
  const key = `${sk.season}_${sk.year}`;
  const cached = _seasonCache.get(key);
  if (cached && Date.now() - cached.ts < SEASON_TTL) return _dedupJikanList(cached.data);

  const out: JikanSeasonAnime[] = [];
  // Dedup by mal_id — defensive (JIKAN pagination kadang kirim anime yang sama di page berbeda)
  const seen = new Set<number>();
  for (let page = 1; page <= 6; page++) {
    try {
      const json = (await jikanFetch(`/seasons/${sk.year}/${sk.season}?page=${page}&limit=25`)) as {
        data?: JikanSeasonAnime[];
        pagination?: { has_next_page?: boolean };
      };
      if (!json?.data?.length) break;
      for (const a of json.data) {
        if (!a.mal_id || seen.has(a.mal_id)) continue;
        seen.add(a.mal_id);
        out.push(a);
      }
      if (!json.pagination?.has_next_page) break;
    } catch (err) {
      // Kalau page intermediate gagal tapi page-1 sudah sukses, jangan buang
      // hasil yang sudah terkumpul — simpan partial & log, biar UI tetap punya data.
      if (out.length > 0) {
        logger.warn({ err: err instanceof Error ? err.message : String(err), season: sk.season, year: sk.year, page, partial: out.length }, "JIKAN: season page failed (keeping partial)");
        break;
      }
      throw err;
    }
  }
  if (out.length === 0) {
    logger.warn({ season: sk.season, year: sk.year }, "JIKAN: season lineup empty (all pages failed)");
    return cached?.data ?? [];
  }
  _seasonCache.set(key, { data: out, ts: Date.now() });
  schedulePersist();
  logger.info({ season: sk.season, year: sk.year, count: out.length }, "JIKAN: season lineup fetched");
  return out;
}

// ── AniList GraphQL fallback ────────────────────────────────────────────────────
// JIKAN v4 akhir-akhir ini sering 504 ("JIKAN failed to connect to MyAnimeList")
// — artinya MAL backend lagi down, bukan masalah kita. Sebagai backup yang tidak
// tergantung MAL, kita pakai AniList GraphQL (`Page(media(season, seasonYear))`).
// Hasil di-map ke JikanSeasonAnime shape supaya jikanToUpcoming() di klien Anisub
// tetap jalan tanpa cabang terpisah.

interface AniListMedia {
  idMal: number | null;
  title: { romaji?: string | null; english?: string | null; native?: string | null };
  coverImage: { extraLarge?: string | null; large?: string | null; color?: string | null };
  averageScore?: number | null;
  popularity?: number | null;
  genres?: string[];
  format?: string | null;
  episodes?: number | null;
  status?: string | null;
  startDate: { year: number | null; month: number | null; day: number | null };
  description?: string | null;
}

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const SEASON_TO_ANILIST: Record<SeasonWord, "WINTER" | "SPRING" | "SUMMER" | "FALL"> = {
  winter: "WINTER", spring: "SPRING", summer: "SUMMER", fall: "FALL",
};
type AniListSeasonEnum = "WINTER" | "SPRING" | "SUMMER" | "FALL";
let _anilistLastCallAt = 0;
async function anilistGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const wait = 700 - (Date.now() - _anilistLastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  _anilistLastCallAt = Date.now();
  const res = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: unknown[] };
  if (json.errors?.length) {
    const sample = JSON.stringify(json.errors).slice(0, 200);
    throw new Error(`AniList errors: ${sample}`);
  }
  if (!json.data) throw new Error("AniList returned no data");
  return json.data;
}

const ANILIST_SEASON_QUERY = `query ($season: MediaSeason!, $year: Int!, $page: Int!) {
  Page(perPage: 50, page: $page) {
    pageInfo { hasNextPage currentPage }
    media(season: $season, seasonYear: $year, type: ANIME, sort: [POPULARITY_DESC]) {
      idMal
      title { romaji english native }
      coverImage { extraLarge large color }
      averageScore
      popularity
      genres
      format
      episodes
      status
      startDate { year month day }
      description
    }
  }
}`;

function anilistToJikanShape(
  a: AniListMedia,
  season: SeasonWord,
  year: number,
): JikanSeasonAnime | null {
  if (!a?.idMal) return null; // skip anime tanpa MAL mapping — kartu Anisub selalu pakai MAL id
  const sy = a.startDate?.year ?? year;
  const sm = a.startDate?.month ?? 1;
  const sd = a.startDate?.day ?? 1;
  const ts = new Date(Date.UTC(sy, sm - 1, sd)).toISOString();
  return {
    mal_id: a.idMal,
    url: `https://myanimelist.net/anime/${a.idMal}`,
    title: a.title?.romaji || a.title?.english || a.title?.native || "(no title)",
    title_english: a.title?.english ?? null,
    title_japanese: a.title?.native ?? null,
    type: a.format ?? null,
    episodes: a.episodes ?? null,
    status: a.status?.replace(/_/g, " ") || "Unknown",
    airing: false,
    aired: { from: ts, to: null, string: ts.split("T")[0] },
    duration: null, rating: null,
    score: a.averageScore != null ? a.averageScore / 10 : null,
    scored_by: null, rank: null,
    popularity: a.popularity ?? null,
    members: null, favorites: null,
    synopsis: a.description ?? null,
    background: null,
    season, year,
    broadcast: { day: null, time: null, timezone: null, string: null },
    producers: [], studios: [], themes: [], demographics: [],
    genres: (a.genres ?? []).map((name, i) => ({ mal_id: i, type: "genre" as const, name })),
    images: {
      jpg: {
        image_url: a.coverImage?.large ?? a.coverImage?.extraLarge ?? "",
        large_image_url: a.coverImage?.extraLarge ?? a.coverImage?.large ?? "",
      },
      webp: { image_url: null, small_image_url: null, large_image_url: null },
    },
    trailer: null,
  };
}

const _anilistSeasonCache = new Map<string, { data: JikanSeasonAnime[]; ts: number }>();
const ANILIST_BACKUP_TTL = 3 * 3600_000; // 3 jam — bukan data kritis, refresh pagi hari cukup

/** Backup 1 musim dari AniList GraphQL — dipanggil oleh routes/jikan.ts kalau
 *  JIKAN timeout / empty. Cache memory 3 jam supaya hemat AniList rate-limit. */
export async function fetchAniListSeasonBackup(sk: JikanSeasonKey): Promise<JikanSeasonAnime[]> {
  const key = `${sk.season}_${sk.year}`;
  const cached = _anilistSeasonCache.get(key);
  if (cached && Date.now() - cached.ts < ANILIST_BACKUP_TTL) return _dedupJikanList(cached.data);

  const out: JikanSeasonAnime[] = [];
  const seen = new Set<number>();
  for (let page = 1; page <= 3; page++) {
    try {
      const data = await anilistGraphQL<{
        Page: {
          pageInfo: { hasNextPage: boolean; currentPage: number };
          media: AniListMedia[];
        };
      }>(ANILIST_SEASON_QUERY, {
        season: SEASON_TO_ANILIST[sk.season] as AniListSeasonEnum,
        year: sk.year,
        page,
      });
      const media = data?.Page?.media ?? [];
      if (!media.length) break;
      for (const a of media) {
        const j = anilistToJikanShape(a, sk.season, sk.year);
        if (!j || seen.has(j.mal_id)) continue;
        seen.add(j.mal_id);
        out.push(j);
      }
      if (!data?.Page?.pageInfo?.hasNextPage) break;
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), sk, page }, "AniList backup page failed");
      if (out.length > 0) break;
      throw err;
    }
  }
  if (out.length === 0) return cached?.data ?? [];
  _anilistSeasonCache.set(key, { data: out, ts: Date.now() });
  logger.info({ season: sk.season, year: sk.year, count: out.length }, "AniList season backup fetched");
  return out;
}

/** Fetch detail lengkap + characters + staff. */
export async function fetchJikanAnimeFull(malId: number): Promise<JikanDetail | null> {
  const cached = _detailCache.get(malId);
  if (cached && Date.now() - cached.ts < DETAIL_TTL) return cached.data;

  try {
    const json = (await jikanFetch(`/anime/${malId}/full`)) as { data?: JikanDetail };
    const detail = json?.data;
    if (!detail) return null;

    const [charsRes, staffRes] = await Promise.allSettled([
      jikanFetch(`/anime/${malId}/characters`) as Promise<{ data?: JikanCharacter[] }>,
      jikanFetch(`/anime/${malId}/staff`) as Promise<{ data?: JikanStaff[] }>,
    ]);
    if (charsRes.status === "fulfilled") detail.__characters = charsRes.value?.data ?? [];
    if (staffRes.status === "fulfilled") detail.__staff = staffRes.value?.data ?? [];

    _detailCache.set(malId, { data: detail, ts: Date.now() });
    schedulePersist();
    logger.info({ malId, title: detail.title, chars: detail.__characters?.length ?? 0, staff: detail.__staff?.length ?? 0 }, "JIKAN: anime detail fetched");
    return detail;
  } catch (err) {
    logger.warn({ err, malId }, "JIKAN: detail fetch failed");
    return cached?.data ?? null;
  }
}

/** Pre-warm cache untuk semua 4 musim ke depan. Dipanggil di server startup. */
export async function warmJikanCache(): Promise<void> {
  const seasons = getUpcomingSeasons();
  logger.info({ seasons: seasons.map((s) => `${s.season}/${s.year}`) }, "JIKAN: warming cache for upcoming seasons");
  for (const sk of seasons) {
    try {
      await fetchJikanSeason(sk);
    } catch (err) {
      logger.warn({ err, sk }, "JIKAN: warm failed for season");
    }
  }
}

/** Background refresh periodik (1 jam). Lineup musim berubah paling banter
 *  tiap beberapa hari (pengumuman baru) — refresh tiap jam cukup buat halaman
 *  Musim tayang lineup terbaru tanpa user refresh manual. Rate-limit JIKAN /
 *  AniList aman karena tiap refresh cuma ~24 req (4 musim × page 6) dengan
 *  gap 600ms per halaman.
 *
 *  Server endpoint `/api/jikan/season-future` respon cache 1 jam (lihat
 *  `routes/jikan.ts`) supaya browser cukup fetch 1× per kunjungan dan tetap
 *  dekat real-time.
 */
let _refreshTimer: NodeJS.Timeout | null = null;
export function startJikanRefresh(): void {
  if (_refreshTimer) return;
  const ONE_HOUR_MS = 60 * 60_000;
  _refreshTimer = setInterval(() => {
    warmJikanCache().catch((err) => logger.warn({ err }, "JIKAN: periodic refresh failed"));
  }, ONE_HOUR_MS);
}

/** Cache status — untuk /api/jikan/cache-status (debug). */
export function getJikanCacheStatus() {
  return {
    seasons: Array.from(_seasonCache.entries()).map(([k, v]) => ({
      key: k,
      count: v.data.length,
      ageHours: ((Date.now() - v.ts) / 3600_000).toFixed(2),
    })),
    detailCount: _detailCache.size,
    rate: { lastCallAt: _lastCallAt, pausedUntil: _pausedUntil },
  };
}
