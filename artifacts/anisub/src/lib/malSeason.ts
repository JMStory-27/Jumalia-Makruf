/**
 * Sumber data halaman Musim (Anisub): MAL via JIKAN via api-server.
 *
 * Alasan pakai MAL/JIKAN: line-up lebih lengkap dan rapi rotasi musimnya
 * persis sama (Spring/Summer/Fall/Winter), gampang dibuat tahunan.
 *
 * Alur:
 *   - Lineup 4 musim ke depan:
 *       api-server fetch JIKAN `/seasons/{year}/{season}` SEKALI lalu cache
 *       6 jam di server + 1 jam browser. Anisub tinggal hit `/api/jikan/season-future`,
 *       dapat JSON lengkap berisi 4 musim langsung di-load client.
 *   - Detail lengkap per anime:
 *       api-server JIKAN `/anime/{id}/full` + `/characters` + `/staff`.
 *       Cache 24 jam di server, dipakai pas user klik kartu.
 *
 * Countdown akurat ke-detik pakai `aired.from` (ISO tanggal rilis EP 1).
 * JIKAN tidak punya schedule per-episode untuk upcoming, tapi EP pertama
 * selalu `aired.from` jadi cukup untuk kartu lineup.
 *
 * Catatan kompatibilitas: `id` di bawah ini = MAL id (sebelumnya AniList id).
 * Routing `/upcoming/:id` di Wouter pakai parameter ini apa adanya.
 */

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api").replace(/\/$/, "");

export interface SeasonKey { season: "WINTER" | "SPRING" | "SUMMER" | "FALL"; year: number }

const SEASON_TO_LOWER: Record<SeasonKey["season"], "winter" | "spring" | "summer" | "fall"> = {
  WINTER: "winter", SPRING: "spring", SUMMER: "summer", FALL: "fall",
};

/** 4 musim ke depan dari hari ini (carry otomatis ke tahun berikutnya). */
export function getUpcomingSeasons(now = new Date()): SeasonKey[] {
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  const cur: SeasonKey["season"] =
    m <= 3 ? "WINTER" : m <= 6 ? "SPRING" : m <= 9 ? "SUMMER" : "FALL";
  const order: SeasonKey["season"][] = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const out: SeasonKey[] = [];
  let idx = order.indexOf(cur);
  let yr = y;
  for (let i = 0; i < 4; i++) {
    out.push({ season: order[idx]!, year: yr });
    if (idx === 3) { idx = 0; yr++; } else idx++;
  }
  return out;
}

/** Rentang tanggal UTC untuk 1 musim (JST-based + 30d grace untuk handle edge case).
 *  Summer {y} = 1 Jul - 30 Sep {y} dst. Dipakai validasi anime yang claim-nya
 *  di musim X tapi aired.from-nya DI LUAR rentang itu (misal Jan 2026 di Fall 2026). */
function seasonDateWindow(sk: SeasonKey): { startMs: number; endMs: number } {
  const y = sk.year;
  switch (sk.season) {
    case "WINTER": return { startMs: Date.UTC(y, 0, 1), endMs: Date.UTC(y, 2, 31, 23, 59, 59) };
    case "SPRING": return { startMs: Date.UTC(y, 3, 1), endMs: Date.UTC(y, 5, 30, 23, 59, 59) };
    case "SUMMER": return { startMs: Date.UTC(y, 6, 1), endMs: Date.UTC(y, 8, 30, 23, 59, 59) };
    case "FALL":   return { startMs: Date.UTC(y, 9, 1), endMs: Date.UTC(y, 11, 31, 23, 59, 59) };
  }
}

const ONE_DAY_MS = 24 * 3600_000;

/** Status tayang 1 anime berdasarkan aired.from + status upstream.
 *  Output dipakai untuk badge + sort: coming soon paling atas,
 *  SEDANG TAYANG di bawah, SUDAH_RILIS / SUDAH_TAMAT / TBA di bawah lagi. */
export type AiringStatus =
  | "UPCOMING"        // EP 1 belum tayang
  | "SEDANG_TAYANG"   // EP 1 tayang < 1 hari lalu / hari ini
  | "SUDAH_RILIS"     // EP 1 tayang > 1 hari lalu, status masih Ongoing
  | "SUDAH_TAMAT"     // status 'Finished Airing' dan release date sudah lewat
  | "TBA";            // tidak ada aired.from — tanggal rilis belum diumumkan

/** Sort rank: kecil = muncul lebih dulu di lineup. UPCOMING (0) paling atas,
 *  SEDANG_TAYANG (1), SUDAH_RILIS (2), TBA (3), SUDAH_TAMAT (4) paling bawah. */
export const STATUS_RANK: Record<AiringStatus, number> = {
  UPCOMING: 0,
  SEDANG_TAYANG: 1,
  SUDAH_RILIS: 2,
  TBA: 3,
  SUDAH_TAMAT: 4,
};

export function classifyAiring(
  airingAt: number | null | undefined,
  rawStatus: string | null | undefined,
  now: number = Date.now(),
): AiringStatus {
  if (airingAt == null) return "TBA";
  const ms = airingAt * 1000;
  if (ms > now) return "UPCOMING";
  if (ms > now - ONE_DAY_MS) return "SEDANG_TAYANG"; // hari ini / kemarin = new
  const upper = (rawStatus ?? "").toLowerCase();
  if (upper.includes("finished") || upper.includes("complete")) return "SUDAH_TAMAT";
  return "SUDAH_RILIS";
}

// ── Shape upstream (JIKAN v4) ──────────────────────────────────────────────────
interface JikanSeasonAnime {
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
  season: string | null;
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
  trailer: { youtube_id: string | null; url: string | null; embed_url: string | null } | null;
}

interface JikanCharacter {
  character: { mal_id: number; url: string; images: { jpg: { image_url: string } }; name: string };
  role: string;
  voice_actors: {
    person: { mal_id: number; url: string; images: { jpg: { image_url: string } }; name: string };
    language: string;
  }[];
}

interface JikanStaff {
  person: { mal_id: number; url: string; images: { jpg: { image_url: string } }; name: string };
  positions: string[];
}

interface JikanDetail extends JikanSeasonAnime {
  __characters?: JikanCharacter[];
  __staff?: JikanStaff[];
}

// ── Shape internal — dipakai halaman Musim ─────────────────────────────────────
export interface UpcomingAnime {
  id: number;             // MAL id (kompatibel dengan routing /upcoming/:id)
  idMal: number;
  title: { romaji: string; english?: string | null; native?: string | null };
  coverImage: { large: string; extraLarge?: string };
  bannerImage?: string | null;
  description?: string | null;
  genres: string[];
  status: string;
  episodes?: number | null;
  duration?: number | null;
  format?: string | null;
  averageScore?: number | null;        // 0-100 shaped (MAL 0-10 ×10) — kompatibel UI/=10
  meanScore?: number | null;
  popularity?: number | null;
  season?: SeasonKey["season"] | null;
  seasonYear?: number | null;
  startDate?: { year: number; month: number; day: number } | null;
  airingAt?: number | null;            // Unix detik — `aired.from` sebagai EP1 release
  studios?: { nodes: { name: string }[] } | null;
  trailer?: { id: string; site: "youtube"; embed_url?: string | null } | null;
  characters?: {
    edges: {
      role: string;
      node: { id: number; name: { full: string; native?: string | null }; image?: { medium?: string | null } | null };
      voiceActors?: { id: number; name: { full: string }; image?: { medium?: string | null } | null }[];
    }[];
  } | null;
  staff?: {
    edges: { role: string; node: { id: number; name: { full: string; native?: string | null }; image?: { medium?: string | null } | null } }[];
  } | null;
}

function parseDurationToMin(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+)\s*min/);
  if (m) return parseInt(m[1]!, 10);
  const h = s.match(/(\d+)\s*hr/);
  if (h) return parseInt(h[1]!, 10) * 60;
  return null;
}

function jikanToUpcoming(j: JikanSeasonAnime): UpcomingAnime {
  const airedFrom = j.aired?.from ? new Date(j.aired.from) : null;
  const tsParsed = airedFrom && !Number.isNaN(airedFrom.getTime()) ? airedFrom : null;
  return {
    id: j.mal_id,
    idMal: j.mal_id,
    title: {
      romaji: j.title || j.title_english || j.title_japanese || "(no title)",
      english: j.title_english ?? null,
      native: j.title_japanese ?? null,
    },
    coverImage: {
      large: j.images?.jpg?.large_image_url || j.images?.jpg?.image_url || "",
      extraLarge: j.images?.jpg?.large_image_url || j.images?.jpg?.image_url || "",
    },
    bannerImage: j.images?.jpg?.large_image_url ?? null,
    description: j.synopsis ?? null,
    genres: (j.genres ?? []).map((g) => g.name),
    status: j.status || "Unknown",
    episodes: j.episodes ?? null,
    duration: parseDurationToMin(j.duration),
    format: j.type ?? null,
    // JIKAN score 0-10 → AniList-shaped 0-100 supaya UI `score/10 toFixed(1)` tetap sama
    averageScore: j.score != null ? Math.round(j.score * 10) : null,
    popularity: j.popularity ?? null,
    season: (j.season?.toUpperCase() ?? null) as SeasonKey["season"] | null,
    seasonYear: j.year ?? null,
    startDate: tsParsed
      ? { year: tsParsed.getUTCFullYear(), month: tsParsed.getUTCMonth() + 1, day: tsParsed.getUTCDate() }
      : null,
    airingAt: tsParsed ? Math.floor(tsParsed.getTime() / 1000) : null,
    studios: j.studios?.length ? { nodes: j.studios.map((s) => ({ name: s.name })) } : null,
    trailer: j.trailer?.youtube_id
      ? { id: j.trailer.youtube_id, site: "youtube", embed_url: j.trailer.embed_url ?? null }
      : null,
  };
}

// ── In-memory cache (anisub-side, 1 jam) ───────────────────────────────────────
const _seasonCache = new Map<string, { data: UpcomingAnime[]; ts: number }>();
const _detailCache = new Map<number, { data: UpcomingAnime; ts: number }>();
const CACHE_TTL = 60 * 60_000;

interface SeasonFuturePayload {
  data: Record<string, { season: string; year: number; count: number; list: JikanSeasonAnime[]; error?: string | null; source?: "MAL" | "AniList" | "none"; warning?: string | null }>;
  generatedAt: string;
}

/** Hasil `fetchSeasonLineup` — bukan hanya list anime, tapi juga error upstream
 *  supaya UI bisa membedakan "musim ini memang belum diumumkan MAL" vs "JIKAN lagi down".
 *  Plus `source` agar UI bisa transparan menunjukkan kalau lineup waktu itu
 *  dapet dari AniList (backup) bukan MAL utama — supaya user paham kenapa
 *  tiba-tiba data tampil walaupun sebelumnya section-nya kosong. */
export interface SeasonFetchResult {
  data: UpcomingAnime[];
  /** Pesan error dari JIKAN/MAL kalau fetch gagal — UI harus surface ini (jangan cuma tampil "kosong"). */
  error?: string;
  /** Sumber data yang dipakai server `season-future` endpoint — "MAL" kalau JIKAN
   *  berhasil, "AniList" kalau fallback, "none" kalau dua-duanya down. */
  source?: "MAL" | "AniList" | "none";
}

/** Ambil lineup 1 musim (dari cache 4-musim endpoint yang sudah ter-prefetch).
 *  ⚠️ DEDUP by `mal_id` — JIKAN pagination kadang kirim anime yang sama di page berbeda
 *     (terbukti: kalau limit 25 dan query page=2-3, anime yang sama kadang muncul lagi). */
export async function fetchSeasonLineup(sk: SeasonKey): Promise<SeasonFetchResult> {
  const key = `${SEASON_TO_LOWER[sk.season]}_${sk.year}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
    const res = await fetch(`${API_BASE}/jikan/season-future?attempt=${attempt + 1}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`MAL season-future ${res.status}`);
    const payload = (await res.json()) as SeasonFuturePayload;
    const block = payload.data?.[key];
    if (!block) return { data: [], error: "Lineup belum diumumkan untuk musim ini." };

    const seen = new Set<number>();
    const unique = block.list.filter((j) => {
      if (!j.mal_id || seen.has(j.mal_id)) return false;
      seen.add(j.mal_id);
      return true;
    });

    const nowMs = Date.now();
    const win = seasonDateWindow(sk);
    // Grace 30 hari di kedua sisi untuk handle anime yang release-nya sedikit
    // geser tanggal musim (e.g. Summer yang release 25 Jun / 3 Okt) — masih
    // boleh di lineup season itu.
    const graceMs = 30 * ONE_DAY_MS;

    const sorted = unique
      .map(jikanToUpcoming)
      // Validasi window musim: drop anime yang `aired.from`-nya DI LUAR
      // rentang season (dengan grace 30 d). Contoh: Fall 2026 tapi
      // release Jan 2026 — itu data error / typo upstream, jangan tampil.
      .filter((a) => {
        if (a.airingAt == null) return true; // TBA → keep, badge-nya nanti muncul
        const ms = a.airingAt * 1000;
        return ms >= win.startMs - graceMs && ms <= win.endMs + graceMs;
      })
      .sort((a, b) => {
        // Sort by classification: UPCOMING (countdown) → SEDANG_TAYANG →
        // SUDAH_RILIS → TBA → SUDAH_TAMAT (paling bawah). Dalam 1 rank sama,
        // urutkan by tanggal terdekat + popularity tiebreak.
        const ca = STATUS_RANK[classifyAiring(a.airingAt, a.status, nowMs)];
        const cb = STATUS_RANK[classifyAiring(b.airingAt, b.status, nowMs)];
        if (ca !== cb) return ca - cb;
        const aA = a.airingAt ?? Number.MAX_SAFE_INTEGER;
        const bA = b.airingAt ?? Number.MAX_SAFE_INTEGER;
        if (aA !== bA) return aA - bA;
        return (b.popularity ?? 0) - (a.popularity ?? 0);
      });

    if (sorted.length > 0 || !block.error) {
      return { data: sorted, error: block.error ?? undefined, source: (block.source as SeasonFetchResult["source"]) ?? undefined };
    }
    throw new Error(block.error);
    } catch (err) {
      lastError = err;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
    }
  }
  return { data: [], error: lastError instanceof Error ? lastError.message : String(lastError), source: "none" };
}

/** Detail lengkap 1 anime (on-demand, cached 1 jam di client). */
export async function fetchUpcomingDetail(malId: number): Promise<UpcomingAnime | null> {
  const cached = _detailCache.get(malId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  try {
    const res = await fetch(`${API_BASE}/jikan/anime/${malId}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`MAL anime/${malId} ${res.status}`);
    const payload = (await res.json()) as { data: JikanDetail };
    const j = payload?.data;
    if (!j) return cached?.data ?? null;

    const up = jikanToUpcoming(j);
    up.description = cleanHtml(j.synopsis);

    up.characters = {
      edges: (j.__characters ?? []).slice(0, 16).map((c) => ({
        role: c.role,
        node: {
          id: c.character.mal_id,
          name: { full: c.character.name, native: null },
          image: { medium: c.character.images?.jpg?.image_url ?? null },
        },
        voiceActors: (c.voice_actors ?? [])
          .filter((v) => v.language === "Japanese")
          .map((v) => ({
            id: v.person.mal_id,
            name: { full: v.person.name },
            image: { medium: v.person.images?.jpg?.image_url ?? null },
          })),
      })),
    };

    up.staff = {
      edges: (j.__staff ?? []).slice(0, 12).map((s) => ({
        role: s.positions.join(", "),
        node: {
          id: s.person.mal_id,
          name: { full: s.person.name, native: null },
          image: { medium: s.person.images?.jpg?.image_url ?? null },
        },
      })),
    };

    _detailCache.set(malId, { data: up, ts: Date.now() });
    return up;
  } catch {
    return cached?.data ?? null;
  }
}

// ── Helpers reused (Indonesian date / countdown) ────────────────────────────────
const ID_MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const ID_MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const ID_DAYS = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "Sekarang!";
  const SEC_PER_MIN = 60, SEC_PER_HOUR = 3600, SEC_PER_DAY = 86400;
  const SEC_PER_MONTH = 30 * SEC_PER_DAY, SEC_PER_YEAR = 365 * SEC_PER_DAY;
  const years = Math.floor(seconds / SEC_PER_YEAR);
  const months = Math.floor((seconds % SEC_PER_YEAR) / SEC_PER_MONTH);
  const days = Math.floor((seconds % SEC_PER_MONTH) / SEC_PER_DAY);
  const hours = Math.floor((seconds % SEC_PER_DAY) / SEC_PER_HOUR);
  const mins = Math.floor((seconds % SEC_PER_HOUR) / SEC_PER_MIN);
  const secs = Math.floor(seconds % SEC_PER_MIN);
  const parts: string[] = [];
  if (years) parts.push(`${years} tahun`);
  if (months) parts.push(`${months} bln`);
  if (days) parts.push(`${days} hr`);
  if (years || months || days) {
    if (hours) parts.push(`${hours} jam`);
    return parts.join(" ");
  }
  parts.push(`${String(hours).padStart(2,"0")}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`);
  return parts.join(" ");
}

export function formatIndonesianDate(
  input: { unix?: number | null; ymd?: { year: number; month: number; day: number } | null },
  withDay = true,
): string {
  let d: Date | null = null;
  if (input.unix) d = new Date(input.unix * 1000);
  else if (input.ymd?.year) d = new Date(input.ymd.year, (input.ymd?.month ?? 1) - 1, input.ymd?.day ?? 1);
  if (!d || Number.isNaN(d.getTime())) return "?";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = ID_MONTHS_SHORT[d.getMonth()];
  const yyyy = d.getFullYear();
  return withDay ? `${ID_DAYS[d.getDay()]}, ${dd} ${mm} ${yyyy}` : `${dd} ${mm} ${yyyy}`;
}

export function formatIndonesianDateLong(
  input: { unix?: number | null; ymd?: { year: number; month: number; day: number } | null },
): string {
  let d: Date | null = null;
  if (input.unix) d = new Date(input.unix * 1000);
  else if (input.ymd?.year) d = new Date(input.ymd.year, (input.ymd?.month ?? 1) - 1, input.ymd?.day ?? 1);
  if (!d || Number.isNaN(d.getTime())) return "?";
  return `${d.getDate()} ${ID_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function getTitle(anime: UpcomingAnime): string {
  return anime.title.english || anime.title.romaji;
}

export function getYouTubeTrailerEmbed(anime: UpcomingAnime): string | null {
  if (anime.trailer?.site === "youtube" && anime.trailer.id) {
    const base = `https://www.youtube.com/embed/${anime.trailer.id}`;
    // Pakai embed_url dari JIKAN kalau tersedia (lebih akurat)
    return anime.trailer.embed_url || `${base}?autoplay=0&rel=0`;
  }
  return null;
}

export function cleanDescription(raw?: string | null): string {
  if (!raw) return "";
  return raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<i>/gi, "").replace(/<\/i>/gi, "")
    .replace(/<b>/gi, "").replace(/<\/b>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "");
}
