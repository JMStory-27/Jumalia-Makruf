import { isCompletedHeuristic } from "./completion";
import { idbCacheGet, idbCacheSet } from "./persistentCache";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";

// Fallback: GitHub raw data (selalu available 24/7 walau Replit off)
const GH_RAW = "https://raw.githubusercontent.com/JMStory-27/Jumalia-Makruf/main/data";

// ── IndexedDB + Memory cache layer ─────────────────────────────────────────
// Dulu pakai localStorage dengan cap 30 entry per cache (biar nggak kena quota) — sekarang
// pindah ke IndexedDB (kapasitas jauh lebih besar) jadi TIDAK ADA lagi limit jumlah entry:
// setiap anime/episode yang pernah dibuka user akan tetap ke-cache.
const DETAIL_MEM = new Map<string, { data: AnimeDetail; ts: number }>();
const EPISODE_MEM = new Map<string, { data: EpisodeDetail; ts: number }>();
const DETAIL_LS_KEY = "anisub_detail_v1";
const EPISODE_LS_KEY = "anisub_episode_v1";
const DETAIL_MEM_TTL  = 2 * 3600_000;   // 2 jam di memory
const DETAIL_LS_TTL   = 8 * 3600_000;   // 8 jam di IndexedDB (anime masih Ongoing — bisa nambah eps)
const EPISODE_MEM_TTL = 30 * 60_000;    // 30 menit di memory
const EPISODE_LS_TTL  = 2 * 3600_000;   // 2 jam di IndexedDB (episode terbaru — server bisa update)

async function idbGet<T>(key: string, id: string, ttl: number): Promise<T | null> {
  return idbCacheGet<T>(`${key}:${id}`, ttl);
}

function idbSetPermanent<T>(key: string, id: string, data: T, permanent: boolean): void {
  idbCacheSet(`${key}:${id}`, data, { permanent }).catch(() => {});
}

export interface AnimeCard {
  title: string;
  poster: string;
  /** Poster URL dari AniList yang di-inject server-side — tersedia langsung tanpa
   *  client-side fetch. Null berarti sudah dicoba tapi tidak ditemukan. Undefined
   *  berarti endpoint ini belum support injection (misal: search, schedule). */
  anilistPoster?: string | null;
  episodes?: string;
  animeId: string;
  latestReleaseDate?: string;
  lastReleaseDate?: string;
  releaseDay?: string;
  score?: string | number;
  status?: string;
  genres?: string[];
}

export interface AnimeListResponse {
  animeList: AnimeCard[];
  maxPage?: number;
}

export interface Genre {
  genreId: string;
  title: string;
}

export interface ScheduleDay {
  title: string;
  animeList: { title: string; animeId: string }[];
}

export interface EpisodeListItem {
  title: string;       // episode number string e.g. "6"
  episodeId: string;
}

export interface GenreItem {
  title: string;
  genreId: string;
}

export interface AnimeDetail {
  title: string;
  japanese?: string;
  poster: string;
  /** Poster HD dari AniList, di-inject server-side. Non-null = sudah resolve. */
  anilistPoster?: string | null;
  synopsis: { paragraphList: (string | { content: string })[] };
  score: string | number;
  status: string;
  type: string;
  episodes: string;
  duration?: string;
  aired: string;
  studios: string;
  genreList: GenreItem[];
  episodeList: EpisodeListItem[];
  recommendedAnimeList: AnimeCard[];
  batch?: unknown;
}

export interface QualityServer {
  title: string;
  serverId: string;
}

export interface QualityItem {
  title: string;
  serverList: QualityServer[];
}

export interface EpisodeDetail {
  title: string;
  animeId: string;
  releaseTime?: string;
  defaultStreamingUrl: string;
  hasPrevEpisode: boolean;
  prevEpisode: { title: string; episodeId: string } | null;
  hasNextEpisode: boolean;
  nextEpisode: { title: string; episodeId: string } | null;
  server: {
    title: string;
    qualityList: QualityItem[];
  };
}

export interface ServerDetail {
  url?: string;
  frameOpen?: string;
  resolution?: string;
  format?: string;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Accept": "application/json" },
  });
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
  const json = await res.json();
  if (json.data?.details) return json.data.details as T;
  return json.data as T;
}

// ── Fallback helper: baca dari GitHub raw JSON ────────────────────────────────
async function ghFetch<T>(filename: string): Promise<T> {
  const res = await fetch(`${GH_RAW}/${filename}`, {
    headers: { "Accept": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GH fallback error ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Public API functions (dengan fallback) ────────────────────────────────────

export async function fetchOngoing(page = 1): Promise<AnimeListResponse> {
  // APK pre-bundled cache check (localStorage ditulis oleh preloader.html saat install pertama)
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("__apk_ongoing_all");
      if (raw) {
        const parsed = JSON.parse(raw) as { animeList: AnimeCard[] };
        if (parsed.animeList?.length) {
          const PAGE_SIZE = 25;
          const start = (page - 1) * PAGE_SIZE;
          const slice = parsed.animeList.slice(start, start + PAGE_SIZE);
          if (slice.length > 0) {
            return { animeList: slice, maxPage: Math.ceil(parsed.animeList.length / PAGE_SIZE) };
          }
        }
      }
    } catch { /* fallthrough ke network */ }
  }
  try {
    const res = await fetch(`${BASE_URL}/otakudesu/ongoing?page=${page}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    return json.data as AnimeListResponse;
  } catch {
    // Fallback ke GitHub raw — hanya page 1
    const data = await ghFetch<{ animeList: AnimeCard[]; maxPage?: number }>("ongoing.json");
    return { animeList: data.animeList ?? [], maxPage: data.maxPage };
  }
}

/** Fetch anime dari jadwal mingguan OtakuDesu (Senin–Minggu), tanpa duplikat.
 *  Ini yang dipakai untuk banner carousel — hanya anime yang sedang tayang minggu ini. */
/** Hari tayang valid — "Random" dibuang karena tidak punya jadwal spesifik */
const VALID_DAYS = new Set(["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"]);

export async function fetchScheduleAnime(): Promise<AnimeCard[]> {
  try {
    const { scheduleList } = await fetchSchedule();
    const seen = new Set<string>();
    const cards: AnimeCard[] = [];
    for (const day of scheduleList) {
      if (!VALID_DAYS.has(day.title)) continue; // skip "Random" dan slot tanpa hari
      for (const a of day.animeList) {
        if (!seen.has(a.animeId)) {
          seen.add(a.animeId);
          cards.push({
            title: a.title,
            poster: "",           // HeroCarousel pakai usePoster hook by title
            animeId: a.animeId,
            releaseDay: day.title,
          });
        }
      }
    }
    return cards;
  } catch {
    // Fallback ke page 1 ongoing
    const data = await fetchOngoing(1);
    return data.animeList;
  }
}

/**
 * Fetch SEMUA halaman ongoing dan kembalikan Map<animeId, AnimeCard> lengkap
 * (dengan status + latestReleaseDate). Dipakai untuk memperkaya data dari
 * fetchSchedule()/fetchScheduleAnime() (yang cuma punya title+animeId) supaya
 * heuristik 7-hari punya tanggal rilis terakhir untuk dicek.
 */
export async function fetchAllOngoingMap(maxPages = 30): Promise<Map<string, AnimeCard>> {
  const map = new Map<string, AnimeCard>();
  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetch(`${BASE_URL}/otakudesu/ongoing?page=${page}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) break;
      const json = await res.json() as { data?: { animeList?: AnimeCard[] } };
      const list = json.data?.animeList ?? [];
      if (list.length === 0) break;
      for (const a of list) map.set(a.animeId, a);
      if (list.length < 25) break;
    } catch {
      break;
    }
  }
  return map;
}

/**
 * Hitung total anime ongoing dari semua halaman OtakuDesu.
 * Panggil API langsung (tanpa fallback GitHub) supaya count tidak inflate.
 * Sequential fetch agar tidak kena rate-limit. Di-cache 1 jam oleh React Query.
 *
 * Difilter dengan heuristik 7 hari (status eksplisit + tanggal rilis terakhir) supaya
 * angkanya konsisten dengan yang benar-benar tampil di jadwal/banner — OtakuDesu sering
 * telat menandai anime "Ongoing" jadi "Tamat" walau sudah lama nggak update episode.
 */
export async function fetchOngoingTotalCount(): Promise<number> {
  let total = 0;
  const MAX = 30; // safety cap
  for (let page = 1; page <= MAX; page++) {
    try {
      const res = await fetch(`${BASE_URL}/otakudesu/ongoing?page=${page}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) break; // API error → stop, jangan fallback
      const json = await res.json() as { data?: { animeList?: AnimeCard[] } };
      const list = json.data?.animeList ?? [];
      if (list.length === 0) break;
      total += list.filter((a) => !isCompletedHeuristic(a)).length;
      if (list.length < 25) break; // halaman terakhir
    } catch {
      break; // timeout / network → berhenti, kembalikan yang sudah terhitung
    }
  }
  return total;
}

export async function fetchCompleted(page = 1): Promise<AnimeListResponse> {
  // APK pre-bundled cache check
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("__apk_completed_all");
      if (raw) {
        const parsed = JSON.parse(raw) as { animeList: AnimeCard[] };
        if (parsed.animeList?.length) {
          const PAGE_SIZE = 25;
          const start = (page - 1) * PAGE_SIZE;
          const slice = parsed.animeList.slice(start, start + PAGE_SIZE);
          if (slice.length > 0) {
            return { animeList: slice, maxPage: Math.ceil(parsed.animeList.length / PAGE_SIZE) };
          }
        }
      }
    } catch { /* fallthrough ke network */ }
  }
  try {
    const res = await fetch(`${BASE_URL}/otakudesu/completed?page=${page}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    return json.data as AnimeListResponse;
  } catch {
    const data = await ghFetch<{ animeList: AnimeCard[]; maxPage?: number }>("completed.json");
    return { animeList: data.animeList ?? [], maxPage: data.maxPage };
  }
}

export async function fetchSearch(q: string): Promise<AnimeListResponse> {
  try {
    const res = await fetch(`${BASE_URL}/otakudesu/search?q=${encodeURIComponent(q)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    return json.data as AnimeListResponse;
  } catch {
    // Fallback: cari dari cache ongoing + completed
    try {
      const [ongoingData, completedData] = await Promise.allSettled([
        ghFetch<{ animeList: AnimeCard[] }>("ongoing.json"),
        ghFetch<{ animeList: AnimeCard[] }>("completed.json"),
      ]);
      const all: AnimeCard[] = [
        ...(ongoingData.status === "fulfilled" ? ongoingData.value.animeList : []),
        ...(completedData.status === "fulfilled" ? completedData.value.animeList : []),
      ];
      const ql = q.toLowerCase();
      const filtered = all.filter((a) => a.title.toLowerCase().includes(ql));
      return { animeList: filtered };
    } catch {
      return { animeList: [] };
    }
  }
}

export async function fetchGenres(): Promise<{ genreList: Genre[] }> {
  return apiFetch(`/otakudesu/genre`);
}

export async function fetchGenreAnime(genreId: string, page = 1): Promise<AnimeListResponse> {
  const res = await fetch(`${BASE_URL}/otakudesu/genre/${genreId}?page=${page}`, { headers: { Accept: "application/json" } });
  const json = await res.json();
  return json.data as AnimeListResponse;
}

export async function fetchSchedule(): Promise<{ scheduleList: ScheduleDay[] }> {
  try {
    const res = await fetch(`${BASE_URL}/otakudesu/schedule`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    return json.data as { scheduleList: ScheduleDay[] };
  } catch {
    const data = await ghFetch<{ scheduleList: ScheduleDay[] }>("schedule.json");
    return { scheduleList: data.scheduleList ?? [] };
  }
}

export async function fetchAnimeDetail(animeId: string): Promise<AnimeDetail> {
  // 1. Memory cache (instan, sesi ini)
  const mem = DETAIL_MEM.get(animeId);
  if (mem && Date.now() - mem.ts < DETAIL_MEM_TTL) return mem.data;

  // 2. IndexedDB — permanent kalau anime sudah Tamat (data statis selamanya),
  //    TTL 8 jam kalau masih Ongoing (episode baru bisa nambah kapan saja).
  const cached = await idbGet<AnimeDetail>(DETAIL_LS_KEY, animeId, DETAIL_LS_TTL);
  if (cached) { DETAIL_MEM.set(animeId, { data: cached, ts: Date.now() }); return cached; }

  const res = await fetch(`${BASE_URL}/otakudesu/anime/${animeId}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  const data = (json.data?.details ?? json.data) as AnimeDetail;
  DETAIL_MEM.set(animeId, { data, ts: Date.now() });
  const isDone = !!data.status && data.status.toLowerCase() !== "ongoing";
  idbSetPermanent(DETAIL_LS_KEY, animeId, data, isDone);
  return data;
}

export async function fetchEpisode(episodeId: string): Promise<EpisodeDetail> {
  // 1. Memory cache
  const mem = EPISODE_MEM.get(episodeId);
  if (mem && Date.now() - mem.ts < EPISODE_MEM_TTL) return mem.data;

  // 2. IndexedDB — episode yang sudah punya "next episode" berarti sudah settled/lawas
  //    (server-nya nggak akan berubah lagi) → permanent. Episode terbaru (belum ada next)
  //    dicache 2 jam saja karena server-nya bisa ditambah/diupdate.
  const cached = await idbGet<EpisodeDetail>(EPISODE_LS_KEY, episodeId, EPISODE_LS_TTL);
  if (cached) { EPISODE_MEM.set(episodeId, { data: cached, ts: Date.now() }); return cached; }

  const res = await fetch(`${BASE_URL}/otakudesu/episode/${episodeId}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  const data = (json.data?.details ?? json.data) as EpisodeDetail;
  EPISODE_MEM.set(episodeId, { data, ts: Date.now() });
  idbSetPermanent(EPISODE_LS_KEY, episodeId, data, !!data.hasNextEpisode);
  return data;
}

// Cache singkat di memory — dipakai supaya prefetch server episode berikutnya (dipanggil
// saat masih nonton episode sekarang, lihat Watch.tsx) benar-benar dipakai ulang begitu
// user pindah episode, bukan fetch ulang dari jaringan.
const SERVER_MEM = new Map<string, { data: ServerDetail; ts: number }>();
const SERVER_MEM_TTL = 10 * 60_000; // 10 menit — link server bisa berubah, jadi tetap pendek

export async function fetchServer(serverId: string): Promise<ServerDetail> {
  const mem = SERVER_MEM.get(serverId);
  if (mem && Date.now() - mem.ts < SERVER_MEM_TTL) return mem.data;

  const methods = ["POST", "GET"];
  for (const method of methods) {
    try {
      const opts: RequestInit = { method, headers: { Accept: "application/json" } };
      if (method === "POST") { opts.headers = { ...opts.headers, "Content-Type": "application/json" }; opts.body = "{}"; }
      const res = await fetch(`${BASE_URL}/otakudesu/server/${serverId}`, opts);
      if (res.ok) {
        const j = await res.json();
        const data = (j.data?.details ?? j.data) as ServerDetail;
        SERVER_MEM.set(serverId, { data, ts: Date.now() });
        return data;
      }
    } catch { /* try next */ }
  }
  throw new Error("Server unreachable");
}

export function getSynopsisText(synopsis: AnimeDetail["synopsis"]): string {
  if (!synopsis) return "";
  if (typeof synopsis === "string") return synopsis;
  return (synopsis.paragraphList ?? [])
    .map((p) => (typeof p === "string" ? p : p.content))
    .filter(Boolean)
    .join("\n\n");
}

// ── Server-side bio cache API ─────────────────────────────────────────────

/** Ambil bio batch dari server cache (sudah di-crawl server dari Wikipedia ID/EN/AniList).
 *  Kembalikan map: { [name]: bioText } — string kosong jika belum ada di cache. */
export async function fetchBiosBatch(names: string[]): Promise<Record<string, string>> {
  if (names.length === 0) return {};
  try {
    const param = names.join(",");
    const res = await fetch(`${BASE_URL}/bio?names=${encodeURIComponent(param)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    const json = await res.json() as { bios?: Record<string, string> };
    return json.bios ?? {};
  } catch {
    return {};
  }
}

/** Minta server untuk mulai crawl bio semua staff/VA dari anime tertentu (fire & forget). */
export function triggerAnimeBioCrawl(title: string): void {
  fetch(`${BASE_URL}/bio/crawl-anime`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ title }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

/**
 * Fetch SEMUA halaman completed dari OtakuDesu dan kembalikan Set animeId.
 * Karena API tidak mengembalikan maxPage, kita paginate sampai dapat halaman
 * yang isinya < 25 (berarti halaman terakhir).
 *
 * Digunakan sebagai filter: anime yang ada di sini TIDAK tampil di jadwal/banner.
 * Kalau di kemudian hari eps baru muncul → AniList RELEASING akan override otomatis.
 *
 * @param maxPages batas aman halaman (default 80 — OtakuDesu punya ~1638 anime completed
 *                 / ~66 halaman per Juli 2026, jadi cap ini dilebihkan biar nggak ada yang
 *                 kepotong/ketinggalan saat difilter dari jadwal/banner).
 */
export async function fetchAllCompletedIds(maxPages = 80): Promise<Set<string>> {
  // Pakai shared cache — sama dengan fetchAllCompletedMap agar tidak fetch dua kali
  const { ids } = await _ensureCompletedAll(maxPages);
  return ids;
}

// ── Shared in-memory cache: completed cards (shared by fetchAllCompletedIds + fetchAllCompletedMap) ──
let _ccCache: { ids: Set<string>; cards: Map<string, AnimeCard>; ts: number } | null = null;
const _CC_TTL = 45 * 60_000; // 45 menit

async function _ensureCompletedAll(maxPages = 80): Promise<{ ids: Set<string>; cards: Map<string, AnimeCard> }> {
  if (_ccCache && Date.now() - _ccCache.ts < _CC_TTL) return _ccCache;
  const ids = new Set<string>();
  const cards = new Map<string, AnimeCard>();

  let firstData: AnimeListResponse;
  try { firstData = await fetchCompleted(1); } catch { return { ids, cards }; }
  for (const a of firstData.animeList ?? []) { ids.add(a.animeId); cards.set(a.animeId, a); }
  if ((firstData.animeList?.length ?? 0) < 25) { _ccCache = { ids, cards, ts: Date.now() }; return _ccCache; }

  const remaining = Math.min(maxPages - 1, 99);
  const batchSize = 5;
  for (let b = 0; b < remaining; b += batchSize) {
    const pages = Array.from({ length: Math.min(batchSize, remaining - b) }, (_, i) => b + i + 2);
    const results = await Promise.allSettled(pages.map((p) => fetchCompleted(p)));
    let hitEnd = false;
    let allFailed = true;
    for (const r of results) {
      if (r.status === "fulfilled") {
        allFailed = false;
        const list = r.value.animeList ?? [];
        for (const a of list) { ids.add(a.animeId); cards.set(a.animeId, a); }
        if (list.length < 25) hitEnd = true;
      }
    }
    if (hitEnd || allFailed) break;
  }
  _ccCache = { ids, cards, ts: Date.now() };
  return _ccCache;
}

/**
 * Fetch SEMUA halaman completed dan kembalikan Map<animeId, AnimeCard>.
 * Shared cache dengan fetchAllCompletedIds — hanya fetch sekali per 45 menit.
 * Dipakai untuk local-search (mencari season lama, movie, OVA yang ada di completed).
 */
export async function fetchAllCompletedMap(maxPages = 80): Promise<Map<string, AnimeCard>> {
  const { cards } = await _ensureCompletedAll(maxPages);
  return cards;
}

// ── Server-side Full Cache (rich metadata: synopsis, trailer, staff, characters+VA) ──────────────
// Data ini di-download oleh scraper dan di-cache di API server. Dibaca client sekali saja,
// lalu di-cache di IndexedDB sehingga berikutnya langsung dari lokal tanpa fetch apapun.

export interface StaffCacheItem {
  role: string;
  name: string | null;
  nameNative?: string | null;
  image?: string | null;
  siteUrl?: string | null;
  id?: number | null;
}

export interface VACacheItem {
  name: string | null;
  nameNative?: string | null;
  image?: string | null;
  siteUrl?: string | null;
  id?: number | null;
}

export interface CharacterCacheItem {
  role: string;
  name: string | null;
  nameNative?: string | null;
  image?: string | null;
  siteUrl?: string | null;
  id?: number | null;
  voiceActors: VACacheItem[];
}

export interface AnimeRichCacheEntry {
  animeId: string;
  title?: string;
  anilistId?: number | null;
  malId?: number | null;
  titleRomaji?: string | null;
  titleEnglish?: string | null;
  titleNative?: string | null;
  banner?: string | null;
  posterHD?: string | null;
  synopsis?: string | null;
  synopsisSource?: string | null;
  trailer?: { id: string; site: string; url?: string; thumbnail?: string | null } | null;
  genres?: string[];
  score?: number | null;
  status?: string | null;
  type?: string | null;
  duration?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  source?: string | null;
  countryOfOrigin?: string | null;
  studios?: { name: string; isMain?: boolean }[];
  staff?: StaffCacheItem[];
  characters?: CharacterCacheItem[];
  relations?: { type: string; id: number | null; title: string | null; mediaType?: string | null; format?: string | null }[];
  nextEpisode?: { episode: number; airingAt: number } | null;
}

const RICH_CACHE_MEM = new Map<string, { data: AnimeRichCacheEntry; ts: number }>();
const RICH_CACHE_TTL = 24 * 3600_000; // 24 jam

/**
 * Ambil data rich (synopsis, trailer, staff, characters+VA) dari server-side full cache.
 * Jauh lebih cepat daripada fetch langsung ke AniList:
 *   1. Cek memory (instan, 24 jam)
 *   2. Cek IndexedDB (instan, permanent kalau ada anilistId)
 *   3. Fetch dari API server (sudah pre-download di /tmp/)
 * Tidak perlu Internet untuk AniList kalau data sudah di-cache di IndexedDB.
 */
export async function fetchAnimeRichCache(animeId: string): Promise<AnimeRichCacheEntry | null> {
  // 1. Memory
  const mem = RICH_CACHE_MEM.get(animeId);
  if (mem && Date.now() - mem.ts < RICH_CACHE_TTL) return mem.data;

  // 2. IndexedDB
  const idbHit = await idbCacheGet<AnimeRichCacheEntry>(`anisub_srv_rich_v1:${animeId}`, RICH_CACHE_TTL);
  if (idbHit) {
    RICH_CACHE_MEM.set(animeId, { data: idbHit, ts: Date.now() });
    return idbHit;
  }

  // 3. API server
  try {
    const res = await fetch(`${BASE_URL}/anisub/rich/${animeId}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: AnimeRichCacheEntry };
    const data = json.data;
    if (!data) return null;
    RICH_CACHE_MEM.set(animeId, { data, ts: Date.now() });
    // Simpan permanent kalau ada AniList ID (data lengkap), TTL 24 jam kalau tidak ada
    idbCacheSet(`anisub_srv_rich_v1:${animeId}`, data, { permanent: !!data.anilistId }).catch(() => {});
    return data;
  } catch {
    return null;
  }
}

export function flattenServers(episode: EpisodeDetail): { title: string; serverId: string; quality: string }[] {
  if (!episode?.server?.qualityList) return [];
  return episode.server.qualityList.flatMap((q) =>
    (q.serverList ?? []).map((s) => ({
      title: s.title,
      quality: q.title.trim(),
      serverId: s.serverId,
    }))
  );
}
