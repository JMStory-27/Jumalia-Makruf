import type { ContentCard } from "./types";

const WATCHLIST_KEY = "lv_watchlist";
const HISTORY_KEY = "lv_history";

function safeGet<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; }
  catch { return fallback; }
}

function safeSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function getWatchlist(): ContentCard[] {
  return safeGet<ContentCard[]>(WATCHLIST_KEY, []);
}

export function toggleWatchlist(card: ContentCard): boolean {
  const list = getWatchlist();
  const idx = list.findIndex(c => c.id === card.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    safeSet(WATCHLIST_KEY, list);
    return false;
  } else {
    list.unshift(card);
    safeSet(WATCHLIST_KEY, list.slice(0, 100));
    return true;
  }
}

export function isInWatchlist(id: string): boolean {
  return getWatchlist().some(c => c.id === id);
}

export function getHistory(): ContentCard[] {
  return safeGet<ContentCard[]>(HISTORY_KEY, []);
}

export function addToHistory(card: ContentCard) {
  const list = getHistory().filter(c => c.id !== card.id);
  list.unshift({ ...card, releaseDate: new Date().toISOString() });
  safeSet(HISTORY_KEY, list.slice(0, 50));
}
