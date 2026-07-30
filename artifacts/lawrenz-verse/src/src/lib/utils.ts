import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ContentCard } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hashId(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date(dateStr));
  } catch { return dateStr; }
}

export function gradientFromTitle(title: string): string {
  const h = hashId(title);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${hue1},70%,18%) 0%, hsl(${hue2},60%,12%) 100%)`;
}

export function initials(title: string): string {
  return title.split(/\s+/).slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "??";
}

export function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

export function getContentUrl(card: ContentCard): string {
  return `/detail/${card.type}/${encodeURIComponent(card.id)}`;
}

export function getWatchUrl(card: ContentCard, epId?: string): string {
  const base = `/watch/${card.type}/${encodeURIComponent(card.id)}`;
  return epId ? `${base}?ep=${epId}` : base;
}
