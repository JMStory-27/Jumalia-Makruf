import type { ContentCard, ContentType } from "./types";

const API = "/api/lv";

export interface FeedResponse {
  ok: boolean;
  items: ContentCard[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchFeed(type: ContentType): Promise<FeedResponse> {
  try {
    return await get<FeedResponse>(`${API}/${type}`);
  } catch {
    return { ok: true, items: FALLBACK[type] ?? [] };
  }
}

export async function fetchTrending(): Promise<ContentCard[]> {
  try {
    const r = await get<FeedResponse>(`${API}/trending`);
    return r.items.length ? r.items : defaultTrending();
  } catch {
    return defaultTrending();
  }
}

function defaultTrending(): ContentCard[] {
  const seen = new Set<string>();
  const candidates = [
    ...FALLBACK.drakor.slice(0, 3),
    ...FALLBACK.dracin.slice(0, 3),
    ...FALLBACK.film.slice(0, 2),
    ...FALLBACK.series.slice(0, 2),
  ];
  return candidates.filter(c => seen.has(c.id) ? false : (seen.add(c.id), true));
}

export async function fetchTodayUpdates(): Promise<ContentCard[]> {
  try {
    const r = await get<FeedResponse>(`${API}/today`);
    return r.items.length ? r.items : [...FALLBACK.dracin.slice(0, 3), ...FALLBACK.drakor.slice(0, 3)];
  } catch {
    return [...FALLBACK.dracin.slice(0, 3), ...FALLBACK.drakor.slice(0, 3)];
  }
}

export async function fetchDetail(slug: string, type?: string): Promise<ContentCard | null> {
  try {
    const qs = type ? `?type=${encodeURIComponent(type)}` : "";
    const r = await get<{ ok: boolean; item: ContentCard | null }>(`${API}/detail/${encodeURIComponent(slug)}${qs}`);
    return r.item ?? null;
  } catch {
    return null;
  }
}

export async function fetchSearch(q: string): Promise<ContentCard[]> {
  if (!q.trim()) return [];
  try {
    const r = await get<FeedResponse>(`${API}/search?q=${encodeURIComponent(q)}`);
    return r.items;
  } catch {
    const all = [...FALLBACK.dracin, ...FALLBACK.drakor, ...FALLBACK.film, ...FALLBACK.series];
    return all.filter(c => c.title.toLowerCase().includes(q.toLowerCase())).slice(0, 20);
  }
}

function dc(id: string, title: string, poster: string, year: string, type: ContentType, mediaType: "tv" | "movie" = "tv"): ContentCard {
  return {
    id, title, poster,
    href: `/watch/${type}/${id}`,
    type, source: "DrakorID",
    episodes: "?", rating: "8.0",
    status: "Completed" as const,
    genres: [], year,
    synopsis: "",
    mediaType,
    totalEpisodes: 0,
    totalSeasons: 1,
    drakoridSlug: id,
  };
}

export const FALLBACK: Record<ContentType, ContentCard[]> = {
  dracin: [
    dc("the-first-jasmine-2026", "The First Jasmine", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDYvMTI1LW1va2RhajRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("ashes-to-crown-2026", "Ashes to Crown", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDYvNDQ0LWRrZWt4cDRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("dazzling-2026", "Dazzling", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvNzI4LWtwb3FxODRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("the-heir-2026", "The Heir", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMzgzLWRrNmR4cDRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("zhan-zhao-adventures-2026", "Zhan Zhao Adventures", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMTQ4LWtwNjB6MDRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("bloom-life-2026", "Bloom Life", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvNDgtNzM0dzByNGYuanBn/180x200/1.jpg", "2026", "dracin"),
    dc("born-with-luck-2026", "Born with Luck", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMzA5LXl3eHFlYjRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("lady-liberty-2026", "Lady Liberty", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvNTQ2LWIzZHZ3ZTRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("a-splendid-match-2026", "A Splendid Match", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMzk0LXB4NjJuODNmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("turning-life-around-2026", "Turning Life Around", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvNzcxLTczcnJ2cjRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("echoes-of-gang-city-2026", "Echoes of Gang City", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvMjYxLW84MHozeTRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
    dc("light-to-the-night-2026", "Light to the Night", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvNjk3LTgxNG93YjRmLmpwZw--/180x200/1.jpg", "2026", "dracin"),
  ],
  drakor: [
    dc("teach-you-a-lesson-2026", "Teach You a Lesson", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDYvMzA1LW9xenY2azRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
    dc("doctor-on-the-edge-2026", "Doctor on the Edge", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDYvNzE1LXl3eHp5azRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
    dc("reborn-rookie-2026", "Reborn Rookie", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMjAzLXJvb2tpZWVtcGxveWVlY2hhaXJtYW5rYW5nLXAuanBn/180x200/1.jpg", "2026", "drakor"),
    dc("fifties-professionals-2026", "Fifties Professionals", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvNTgwLW1vNHd6MzRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
    dc("azure-spring-2026", "Azure Spring", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMjEyLWIzYXB2dzRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
    dc("the-wonderfools-2026", "The WONDERfools", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvODg5LWwwbThiajRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
    dc("the-legend-of-kitchen-soldier-2026", "The Legend of Kitchen Soldier", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMjAzLWpiNmdleDRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
    dc("my-royal-nemesis-2026", "My Royal Nemesis", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMzY4LW5vb3d3ZTRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
    dc("gold-land-2026", "Gold Land", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvMzkwLW5venllNjRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
    dc("filing-for-love-2026", "Filing for Love", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvMTA0LWZpbGluZ2ZvcmxvdmUtcC5qcGc-/180x200/1.jpg", "2026", "drakor"),
    dc("if-wishes-could-kill-2026", "If Wishes Could Kill", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvMTgzLXZ4M3ozcTRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
    dc("sold-out-on-you-2026", "Sold Out on You", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvOTYzLWcwZHh3bzRmLmpwZw--/180x200/1.jpg", "2026", "drakor"),
  ],
  film: [
    dc("salmokji-whispering-water-2026", "Salmokji: Whispering Water", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvNDUxLWtweXhkdjRmLmpwZw--/180x200/1.jpg", "2026", "film", "movie"),
    dc("the-ugly-2025", "The Ugly", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMjM2LWwwbnpyZTRmLmpwZw--/180x200/1.jpg", "2025", "film", "movie"),
    dc("the-kings-warden-2026", "The Kings Warden", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMzY0LWcwN25tdzRmLmpwZw--/180x200/1.jpg", "2026", "film", "movie"),
    dc("the-informant-2025", "The Informant", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvOTA3LXpieHF6dzRmLmpwZw--/180x200/1.jpg", "2025", "film", "movie"),
    dc("the-favor-2025", "The Favor", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvNjA0LXRoZWZhdm9ya20tcC5qcGVn/180x200/1.jpg", "2025", "film", "movie"),
    dc("green-in-my-heart-2020", "Green in My Heart", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvNDA4LXdyd241Zi5qcGc-/180x200/1.jpg", "2020", "film", "movie"),
    dc("humint-2026", "Humint", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvNTgxLWh1bWludGtkLXAuanBn/180x200/1.jpg", "2026", "film", "movie"),
    dc("you-will-die-in-6-hours-2024", "You Will Die in 6 Hours", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvNTIzLXlvdXdpbGxkaWVpbjZob3Vycy1wMS5qcGVn/180x200/1.jpg", "2024", "film", "movie"),
    dc("no-parking-2025", "No Parking", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvMzA3LXB4cWV2ODRmLmpwZw--/180x200/1.jpg", "2025", "film", "movie"),
    dc("boss-2025", "Boss", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvOTIxLWIzbHduZTRmLmpwZw--/180x200/1.jpg", "2025", "film", "movie"),
    dc("homeward-bound-2025", "Homeward Bound", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvNTI0LWhvbWV3YXJkYm91bmQtcC5qcGVn/180x200/1.jpg", "2025", "film", "movie"),
    dc("home-behind-bars-2025", "Home Behind Bars", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDQvMjQ0LXpid29hYTRmLmpwZw--/180x200/1.jpg", "2025", "film", "movie"),
  ],
  series: [
    dc("teach-you-a-lesson-2026", "Teach You a Lesson", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDYvMzA1LW9xenY2azRmLmpwZw--/180x200/1.jpg", "2026", "series"),
    dc("the-first-jasmine-2026", "The First Jasmine", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDYvMTI1LW1va2RhajRmLmpwZw--/180x200/1.jpg", "2026", "series"),
    dc("doctor-on-the-edge-2026", "Doctor on the Edge", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDYvNzE1LXl3eHp5azRmLmpwZw--/180x200/1.jpg", "2026", "series"),
    dc("ashes-to-crown-2026", "Ashes to Crown", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDYvNDQ0LWRrZWt4cDRmLmpwZw--/180x200/1.jpg", "2026", "series"),
    dc("reborn-rookie-2026", "Reborn Rookie", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMjAzLXJvb2tpZWVtcGxveWVlY2hhaXJtYW5rYW5nLXAuanBn/180x200/1.jpg", "2026", "series"),
    dc("dazzling-2026", "Dazzling", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvNzI4LWtwb3FxODRmLmpwZw--/180x200/1.jpg", "2026", "series"),
    dc("the-heir-2026", "The Heir", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMzgzLWRrNmR4cDRmLmpwZw--/180x200/1.jpg", "2026", "series"),
    dc("fifties-professionals-2026", "Fifties Professionals", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvNTgwLW1vNHd6MzRmLmpwZw--/180x200/1.jpg", "2026", "series"),
    dc("azure-spring-2026", "Azure Spring", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMjEyLWIzYXB2dzRmLmpwZw--/180x200/1.jpg", "2026", "series"),
    dc("zhan-zhao-adventures-2026", "Zhan Zhao Adventures", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMTQ4LWtwNjB6MDRmLmpwZw--/180x200/1.jpg", "2026", "series"),
    dc("bloom-life-2026", "Bloom Life", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvNDgtNzM0dzByNGYuanBn/180x200/1.jpg", "2026", "series"),
    dc("my-royal-nemesis-2026", "My Royal Nemesis", "https://convert.d-cdn.me/convert/aHR0cHM6Ly9hc3NldHMuZC1jZG4ubWUvaW1nLzIwMjYvMDUvMzY4LW5vb3d3ZTRmLmpwZw--/180x200/1.jpg", "2026", "series"),
  ],
};
