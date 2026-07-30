import { useState, useEffect } from "react";
import { fetchMalPoster } from "./jikan";
import { fetchAniListBannerOnDemand, getCachedBanner } from "./anilist";

export interface AnimeInfo {
  poster: string | null;
  currentEp: number | null;
  /** Absolute Unix timestamp (seconds) kapan eps berikutnya tayang, dari AniList. */
  nextAiringAt: number | null;
  /** Tahun mulai tayang (seasonYear dari AniList). */
  year: number | null;
  /** AniList averageScore (0–100). Bagi 10 untuk tampilan (mis. 83 → 8.3). */
  averageScore: number | null;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";

/** Cache in-memory untuk hasil /api/poster/resolve agar tidak hit berulang */
const _resolveCache = new Map<string, { url: string | null; ts: number }>();
const RESOLVE_TTL = 24 * 3600_000;

async function resolveServerPoster(title: string): Promise<string | null> {
  const key = title.toLowerCase();
  const cached = _resolveCache.get(key);
  if (cached && Date.now() - cached.ts < RESOLVE_TTL) return cached.url;
  try {
    const res = await fetch(`${API_BASE}/poster/resolve?title=${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { poster?: string | null };
    const url = data.poster || null;
    _resolveCache.set(key, { url, ts: Date.now() });
    return url;
  } catch {
    return null;
  }
}

/**
 * Returns the best available HD poster URL + current episode count for an anime.
 *
 * @param title        Judul anime (dipakai untuk lookup AniList/MAL jika serverPoster tidak ada)
 * @param serverPoster URL poster yang sudah di-resolve server-side (dari anilistPoster di API response).
 *                     Jika non-null string → pakai langsung, skip semua client-side AniList fetch.
 *                     Jika null → sudah dicoba dari full-cache, tidak ada hasil → coba live resolve dulu.
 *                     Jika undefined → endpoint belum support, jalankan logik client-side normal.
 *
 * Reads synchronously from localStorage/memory cache first → renders instantly on repeat visits.
 * Falls back to /api/poster/resolve (server-side live AniList), then MAL.
 */
export function useAnimeInfo(title: string, serverPoster?: string | null): AnimeInfo {
  const [info, setInfo] = useState<AnimeInfo>(() => {
    if (!title) return { poster: null, currentEp: null, nextAiringAt: null, year: null, averageScore: null };
    // Server sudah resolve poster — pakai langsung
    if (serverPoster) return { poster: serverPoster, currentEp: null, nextAiringAt: null, year: null, averageScore: null };
    const cached = getCachedBanner(title);
    return {
      poster: cached?.cover ?? null,
      currentEp: cached?.currentEp ?? null,
      nextAiringAt: cached?.nextAiringAt ?? null,
      year: cached?.seasonYear ?? null,
      averageScore: cached?.averageScore ?? null,
    };
  });

  useEffect(() => {
    if (!title) return;

    // ── FAST PATH: server sudah sediakan poster URL ──────────────────────────
    if (serverPoster) {
      setInfo((prev) => ({ ...prev, poster: serverPoster }));
      const cached = getCachedBanner(title);
      if (!cached) {
        // Fetch metadata (currentEp, nextAiringAt, year, score) di background tanpa blokir poster
        fetchAniListBannerOnDemand(title).then((entry) => {
          setInfo((prev) => ({
            ...prev,
            poster: prev.poster ?? entry.cover ?? null,
            currentEp: entry.currentEp ?? null,
            nextAiringAt: entry.nextAiringAt ?? null,
            year: entry.seasonYear ?? null,
            averageScore: entry.averageScore ?? null,
          }));
        }).catch(() => { /* ignore */ });
      } else {
        setInfo((prev) => ({
          ...prev,
          currentEp: cached.currentEp ?? null,
          nextAiringAt: cached.nextAiringAt ?? null,
          year: cached.seasonYear ?? null,
          averageScore: cached.averageScore ?? null,
        }));
      }
      return;
    }

    // ── Server null = server sudah coba full-cache tapi tidak ketemu ─────────
    // Strategi: coba /api/poster/resolve (live AniList query server-side) dulu,
    // baru fallback ke MAL jika masih tidak ada.
    if (serverPoster === null) {
      let cancelled = false;

      // Cek cache lokal dulu
      const cached = getCachedBanner(title);
      if (cached?.cover) {
        setInfo({ poster: cached.cover, currentEp: cached.currentEp ?? null, nextAiringAt: cached.nextAiringAt ?? null, year: cached.seasonYear ?? null, averageScore: cached.averageScore ?? null });
        return;
      }

      // Cek _resolveCache in-memory (hanya URL poster, tidak ada year/score di sini)
      const memCached = _resolveCache.get(title.toLowerCase());
      if (memCached && Date.now() - memCached.ts < RESOLVE_TTL && memCached.url) {
        setInfo((prev) => ({ ...prev, poster: memCached.url! }));
        return;
      }

      // Live resolve dari server
      resolveServerPoster(title).then((url) => {
        if (cancelled) return;
        if (url) {
          setInfo((prev) => ({ ...prev, poster: url }));
        } else {
          // Final fallback: MAL
          fetchMalPoster(title).then((malUrl) => {
            if (!cancelled && malUrl) setInfo((prev) => ({ ...prev, poster: malUrl }));
          });
        }
      });

      return () => { cancelled = true; };
    }

    // ── NORMAL PATH: serverPoster === undefined → client-side lookup ──────────
    const cached = getCachedBanner(title);
    if (cached?.cover) {
      setInfo({
        poster: cached.cover,
        currentEp: cached.currentEp ?? null,
        nextAiringAt: cached.nextAiringAt ?? null,
        year: cached.seasonYear ?? null,
        averageScore: cached.averageScore ?? null,
      });
      return;
    }

    let cancelled = false;
    fetchAniListBannerOnDemand(title)
      .then((entry) => {
        if (cancelled) return;
        const { cover, currentEp, nextAiringAt, seasonYear, averageScore } = entry;
        if (cover) {
          setInfo({ poster: cover, currentEp: currentEp ?? null, nextAiringAt: nextAiringAt ?? null, year: seasonYear ?? null, averageScore: averageScore ?? null });
        } else {
          setInfo((prev) => ({ ...prev, currentEp: currentEp ?? null, nextAiringAt: nextAiringAt ?? null, year: seasonYear ?? null, averageScore: averageScore ?? null }));
          fetchMalPoster(title).then((url) => {
            if (!cancelled && url) setInfo((prev) => ({ ...prev, poster: url }));
          });
        }
      })
      .catch(() => {
        fetchMalPoster(title).then((url) => {
          if (!cancelled && url) setInfo((prev) => ({ ...prev, poster: url }));
        });
      });

    return () => { cancelled = true; };
  }, [title, serverPoster]);

  return info;
}

/**
 * Backwards-compat: returns only the poster URL string.
 */
export function usePoster(title: string): string | null {
  return useAnimeInfo(title).poster;
}
