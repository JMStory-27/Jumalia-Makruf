import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Base URL API server — sama dengan yang dipakai fullCacheLoader & usePoster
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";

/**
 * Route URL gambar poster/banner melalui server proxy (/api/poster/p?url=...).
 *
 * Keuntungan:
 *  1. Gambar di-download server-side & di-cache ke disk (/tmp/poster-cache/)
 *     → request kedua langsung dari disk, tidak fetch ulang ke AniList/MAL/OtakuDesu
 *  2. Bypass Cloudflare 403 OtakuDesu (server pakai UA browser mobile)
 *  3. Tidak ada CORS issue — semua request dari domain yang sama
 *  4. Browser + Service Worker juga cache hasilnya (Cache-Control: 7 hari)
 */
export function proxyImg(url: string, _width?: number): string {
  if (!url) return "";
  return `${API_BASE}/poster/p?url=${encodeURIComponent(url)}`;
}

/**
 * Generate a unique, vivid gradient + initials for an anime title.
 * Returns [gradientCSS, initials] — used as placeholder when poster fails.
 */
export function titlePlaceholder(title: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = Math.imul(31, hash) + title.charCodeAt(i);
  }
  const hue = Math.abs(hash) % 360;
  const hue2 = (hue + 55) % 360;
  const grad = `linear-gradient(135deg, hsl(${hue},55%,12%) 0%, hsl(${hue2},65%,20%) 100%)`;
  const words = title.trim().split(/\s+/);
  const initials = words.length === 1
    ? title.slice(0, 2).toUpperCase()
    : (words[0][0] + words[1][0]).toUpperCase();
  return [grad, initials];
}
