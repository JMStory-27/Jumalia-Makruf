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

async function anilistQuery(query: string): Promise<unknown> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`AniList error ${res.status}`);
  return res.json();
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
const BANNER_CACHE_KEY = "anisub_banner_v1";
const bannerMem = new Map<string, { banner: string | null; idMal: number | null }>();

export function cleanAnimeTitle(raw: string): string {
  return raw
    .replace(/\s+Subtitle\s+Indonesia/i, "")
    .replace(/\s+Sub\s+Indo/i, "")
    .replace(/\s+\(End\)/i, "")
    .replace(/\s+Episode\s+\d+/i, "")
    .replace(/\s+Season\s+\d+/i, "")
    .replace(/\s+Part\s+\d+/i, "")
    .trim();
}

// ── Rich AniList data (detail page) ──────────────────────────────────────────
export interface AniListRichData {
  id: number;
  idMal?: number | null;
  bannerImage?: string | null;
  trailer?: { id: string; site: string } | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  endDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  studios?: { nodes: { name: string; isAnimationStudio: boolean }[] };
  staff?: {
    edges: { role: string; node: { id: number; name: { full: string }; image: { medium: string } } }[];
  };
  characters?: {
    edges: {
      node: { id: number; name: { full: string }; image: { medium: string } };
      voiceActors: { id: number; name: { full: string }; image: { medium: string } }[];
    }[];
  };
  airingSchedule?: { nodes: { episode: number; airingAt: number }[] };
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
  anime?: { title: string; image: string }[];
}

const PERSON_MEM: Map<string, PersonDetail> = new Map();
const PERSON_TTL = 24 * 3600_000;

function stripHtml(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchPersonDetail(id: number, type: "staff" | "character"): Promise<PersonDetail | null> {
  const key = `${type}:${id}`;
  if (PERSON_MEM.has(key)) return PERSON_MEM.get(key)!;

  try {
    const stored = JSON.parse(localStorage.getItem("anisub_person_v1") ?? "{}") as Record<string, PersonDetail & { __ts?: number }>;
    const cached = stored[key];
    if (cached && Date.now() - (cached.__ts ?? 0) < PERSON_TTL) {
      PERSON_MEM.set(key, cached);
      return cached;
    }
  } catch {}

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
          staffMedia(perPage: 10, sort: POPULARITY_DESC, type: ANIME) {
            edges { staffRole node { title { romaji } coverImage { medium } } }
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
          media(perPage: 8, sort: POPULARITY_DESC, type: ANIME) {
            edges { node { title { romaji } coverImage { medium } } }
          }
        }
      }`;
    }

    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: q }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: { Staff?: unknown; Character?: unknown } };
    const raw = (type === "staff" ? json.data?.Staff : json.data?.Character) as Record<string, unknown> | undefined;
    if (!raw) return null;

    let anime: { title: string; image: string }[] | undefined;
    if (type === "staff") {
      const staffMedia = raw.staffMedia as { edges?: { staffRole: string; node: { title: { romaji: string }; coverImage: { medium: string } } }[] } | undefined;
      anime = staffMedia?.edges?.map(e => ({ title: e.node.title.romaji, image: e.node.coverImage.medium })) ?? [];
    } else {
      const media = raw.media as { edges?: { node: { title: { romaji: string }; coverImage: { medium: string } } }[] } | undefined;
      anime = media?.edges?.map(e => ({ title: e.node.title.romaji, image: e.node.coverImage.medium })) ?? [];
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
    try {
      const stored = JSON.parse(localStorage.getItem("anisub_person_v1") ?? "{}");
      stored[key] = { ...result, __ts: Date.now() };
      localStorage.setItem("anisub_person_v1", JSON.stringify(stored));
    } catch {}
    return result;
  } catch {
    return null;
  }
}

const RICH_CACHE_KEY = "anisub_rich_v2";
const richMem = new Map<string, AniListRichData>();
const RICH_TTL = 6 * 3600_000;

export async function fetchAniListRichByTitle(rawTitle: string): Promise<AniListRichData | null> {
  const title = cleanAnimeTitle(rawTitle);
  if (!title) return null;
  const key = title.toLowerCase();

  if (richMem.has(key)) return richMem.get(key)!;

  try {
    const stored = JSON.parse(localStorage.getItem(RICH_CACHE_KEY) ?? "{}") as Record<string, AniListRichData & { __ts?: number }>;
    const cached = stored[key];
    if (cached && Date.now() - (cached.__ts ?? 0) < RICH_TTL) {
      richMem.set(key, cached);
      return cached;
    }
  } catch {}

  const safe = title.replace(/"/g, "");
  const q = `{
    Media(type: ANIME, search: "${safe}") {
      id idMal bannerImage
      trailer { id site }
      startDate { year month day }
      endDate { year month day }
      status season seasonYear
      studios(isMain: true) { nodes { name isAnimationStudio } }
      staff(sort: RELEVANCE, perPage: 10) {
        edges { role node { id name { full } image { medium } } }
      }
      characters(sort: [ROLE, RELEVANCE], perPage: 20) {
        edges {
          node { id name { full } image { medium } }
          voiceActors(language: JAPANESE) { id name { full } image { medium } }
        }
      }
      airingSchedule(notYetAired: false, perPage: 50) {
        nodes { episode airingAt }
      }
    }
  }`;

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: q }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: { Media?: AniListRichData } };
    const media = json.data?.Media;
    if (!media) return null;
    const result = { ...media, __ts: Date.now() } as AniListRichData;
    richMem.set(key, result);
    try {
      const stored = JSON.parse(localStorage.getItem(RICH_CACHE_KEY) ?? "{}");
      stored[key] = result;
      localStorage.setItem(RICH_CACHE_KEY, JSON.stringify(stored));
    } catch {}
    return result;
  } catch {
    return null;
  }
}

export async function fetchAniListBannerByTitle(rawTitle: string): Promise<{ banner: string | null; idMal: number | null }> {
  const title = cleanAnimeTitle(rawTitle);
  if (!title) return { banner: null, idMal: null };
  const key = title.toLowerCase();

  if (bannerMem.has(key)) return bannerMem.get(key)!;

  try {
    const stored: Record<string, { banner: string | null; idMal: number | null }> = JSON.parse(
      localStorage.getItem(BANNER_CACHE_KEY) ?? "{}"
    );
    if (stored[key]) {
      bannerMem.set(key, stored[key]);
      return stored[key];
    }
  } catch {}

  try {
    const safe = title.replace(/"/g, "");
    const q = `{ Media(type: ANIME, search: "${safe}") { idMal bannerImage } }`;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: q }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { banner: null, idMal: null };
    const json = await res.json() as { data?: { Media?: { idMal?: number | null; bannerImage?: string | null } } };
    const media = json.data?.Media;
    const result = { banner: media?.bannerImage ?? null, idMal: media?.idMal ?? null };
    bannerMem.set(key, result);
    try {
      const stored: Record<string, typeof result> = JSON.parse(localStorage.getItem(BANNER_CACHE_KEY) ?? "{}");
      stored[key] = result;
      localStorage.setItem(BANNER_CACHE_KEY, JSON.stringify(stored));
    } catch {}
    return result;
  } catch {
    return { banner: null, idMal: null };
  }
}
