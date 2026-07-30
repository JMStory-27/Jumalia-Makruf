export type WatchStatus = "watching" | "completed" | "plan_to_watch" | "on_hold" | "dropped";

export interface WatchlistItem {
  animeId: string;
  title: string;
  poster: string;
  status: WatchStatus;
  progress: number;
  totalEpisodes: number;
  addedAt: number;
  updatedAt: number;
}

export interface HistoryItem {
  animeId: string;
  episodeId: string;
  episodeNum: string;
  title: string;
  poster: string;
  timestamp: number;
}

export interface WatchProgress {
  position: number;
  duration: number;
  updatedAt: number;
}

export interface UserProfile {
  username: string;
  avatarId: number;
  xp: number;
}

const KEYS = {
  watchlist: "anisub_watchlist",
  history: "anisub_history",
  favorites: "anisub_favorites",
  profile: "anisub_profile",
  progress: "anisub_watch_progress",
  theme: "anisub_theme",
  lastRank: "anisub_last_rank",
  onboarding: "anisub_onboarding_v1",
  serverPref: "anisub_server_pref",
};

function load<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    return val ? (JSON.parse(val) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Watchlist
export function getWatchlist(): WatchlistItem[] {
  return load<WatchlistItem[]>(KEYS.watchlist, []);
}

export function getWatchlistItem(animeId: string): WatchlistItem | undefined {
  return getWatchlist().find((i) => i.animeId === animeId);
}

export function upsertWatchlist(item: Omit<WatchlistItem, "addedAt" | "updatedAt">): void {
  const list = getWatchlist();
  const idx = list.findIndex((i) => i.animeId === item.animeId);
  const now = Date.now();
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...item, updatedAt: now };
  } else {
    list.unshift({ ...item, addedAt: now, updatedAt: now });
  }
  save(KEYS.watchlist, list);
}

export function removeWatchlist(animeId: string): void {
  const list = getWatchlist().filter((i) => i.animeId !== animeId);
  save(KEYS.watchlist, list);
}

// History
export function getHistory(): HistoryItem[] {
  return load<HistoryItem[]>(KEYS.history, []);
}

export function addHistory(item: Omit<HistoryItem, "timestamp">): void {
  const list = getHistory().filter((i) => i.episodeId !== item.episodeId);
  list.unshift({ ...item, timestamp: Date.now() });
  save(KEYS.history, list.slice(0, 100));
}

// Favorites
export function getFavorites(): string[] {
  return load<string[]>(KEYS.favorites, []);
}

export function toggleFavorite(animeId: string): boolean {
  const list = getFavorites();
  const idx = list.indexOf(animeId);
  if (idx >= 0) {
    list.splice(idx, 1);
    save(KEYS.favorites, list);
    return false;
  } else {
    list.unshift(animeId);
    save(KEYS.favorites, list);
    return true;
  }
}

export function isFavorite(animeId: string): boolean {
  return getFavorites().includes(animeId);
}

// Progress
export function getProgress(episodeId: string): WatchProgress | null {
  const all = load<Record<string, WatchProgress>>(KEYS.progress, {});
  return all[episodeId] ?? null;
}

export function saveProgress(episodeId: string, position: number, duration: number): void {
  const all = load<Record<string, WatchProgress>>(KEYS.progress, {});
  all[episodeId] = { position, duration, updatedAt: Date.now() };
  save(KEYS.progress, all);
}

// Profile
export function getProfile(): UserProfile {
  return load<UserProfile>(KEYS.profile, { username: "Otaku", avatarId: 0, xp: 0 });
}

export function saveProfile(profile: Partial<UserProfile>): void {
  const current = getProfile();
  save(KEYS.profile, { ...current, ...profile });
}

export function addXp(amount: number): void {
  const profile = getProfile();
  saveProfile({ xp: profile.xp + amount });
}

export const RANK_ORDER = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];

export function getRank(xp: number): string {
  if (xp >= 50000) return "SSS";
  if (xp >= 20000) return "SS";
  if (xp >= 8000) return "S";
  if (xp >= 3000) return "A";
  if (xp >= 1000) return "B";
  if (xp >= 300) return "C";
  if (xp >= 80) return "D";
  if (xp >= 20) return "E";
  return "F";
}

export function getLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 10)) + 1;
}

// Theme
export function getTheme(): "dark" | "light" {
  try {
    return (localStorage.getItem(KEYS.theme) as "dark" | "light") ?? "dark";
  } catch {
    return "dark";
  }
}

export function saveTheme(theme: "dark" | "light"): void {
  localStorage.setItem(KEYS.theme, theme);
}

export function applyTheme(theme: "dark" | "light"): void {
  document.documentElement.setAttribute("data-theme", theme);
}

// Rank change tracking
export function getLastRank(): string {
  try {
    return localStorage.getItem(KEYS.lastRank) ?? getRank(getProfile().xp);
  } catch {
    return "F";
  }
}

export function saveLastRank(rank: string): void {
  localStorage.setItem(KEYS.lastRank, rank);
}

// Onboarding
export function hasSeenOnboarding(): boolean {
  try { return localStorage.getItem(KEYS.onboarding) === "1"; } catch { return true; }
}
export function markOnboardingSeen(): void {
  try { localStorage.setItem(KEYS.onboarding, "1"); } catch {}
}

// Personal stats (item: statistik pribadi mendalam)
export interface WatchStats {
  totalWatchSeconds: number;
  totalWatchHours: number;
  longestFollowed: { animeId: string; title: string; days: number } | null;
}

export function getWatchStats(): WatchStats {
  const progressAll = load<Record<string, WatchProgress>>(KEYS.progress, {});
  let totalWatchSeconds = 0;
  for (const p of Object.values(progressAll)) {
    totalWatchSeconds += Math.max(0, Math.min(p.position, p.duration || p.position));
  }

  const list = getWatchlist();
  let longestFollowed: WatchStats["longestFollowed"] = null;
  for (const item of list) {
    const days = Math.floor((Date.now() - item.addedAt) / 86_400_000);
    if (!longestFollowed || days > longestFollowed.days) {
      longestFollowed = { animeId: item.animeId, title: item.title, days };
    }
  }

  return {
    totalWatchSeconds,
    totalWatchHours: Math.round((totalWatchSeconds / 3600) * 10) / 10,
    longestFollowed,
  };
}

// Server preference
export function getServerPref(): string | null {
  try { return localStorage.getItem(KEYS.serverPref); } catch { return null; }
}
export function saveServerPref(serverName: string): void {
  try { localStorage.setItem(KEYS.serverPref, serverName); } catch {}
}
