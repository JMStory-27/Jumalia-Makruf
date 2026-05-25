const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";

// Fallback: GitHub raw data (selalu available 24/7 walau Replit off)
const GH_RAW = "https://raw.githubusercontent.com/JMStory-27/Jumalia-Makruf/main/data";

export interface AnimeCard {
  title: string;
  poster: string;
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
export async function fetchScheduleAnime(): Promise<AnimeCard[]> {
  try {
    const { scheduleList } = await fetchSchedule();
    const seen = new Set<string>();
    const cards: AnimeCard[] = [];
    for (const day of scheduleList) {
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

export async function fetchCompleted(page = 1): Promise<AnimeListResponse> {
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
  const res = await fetch(`${BASE_URL}/otakudesu/anime/${animeId}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return (json.data?.details ?? json.data) as AnimeDetail;
}

export async function fetchEpisode(episodeId: string): Promise<EpisodeDetail> {
  const res = await fetch(`${BASE_URL}/otakudesu/episode/${episodeId}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return (json.data?.details ?? json.data) as EpisodeDetail;
}

export async function fetchServer(serverId: string): Promise<ServerDetail> {
  const methods = ["POST", "GET"];
  for (const method of methods) {
    try {
      const opts: RequestInit = { method, headers: { Accept: "application/json" } };
      if (method === "POST") { opts.headers = { ...opts.headers, "Content-Type": "application/json" }; opts.body = "{}"; }
      const res = await fetch(`${BASE_URL}/otakudesu/server/${serverId}`, opts);
      if (res.ok) { const j = await res.json(); return (j.data?.details ?? j.data) as ServerDetail; }
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
