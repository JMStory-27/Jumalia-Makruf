import { useEffect, useMemo, useState, useRef } from "react";
import { fetchAniListRichByTitle, cleanAnimeTitle } from "./anilist";

/** Anime dianggap tamat/mangkrak kalau tidak ada episode baru selama ini.
 *  7 hari + 3 jam (171 jam) — tepat 1 minggu plus grace period kecil untuk
 *  server OtakuDesu yang sering telat update. Presisi jam, bukan hari kalender,
 *  supaya tidak salah anggap tamat hanya karena pergantian hari.
 *  Kalau eps baru muncul lagi → AniList RELEASING override, auto ongoing lagi. */
const STALE_HOURS_THRESHOLD = 7 * 24 + 3; // 171 jam = 7 hari + 3 jam

const ID_MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5,
  jul: 6, agu: 7, sep: 8, okt: 9, nov: 10, des: 11,
};

/** Parse tanggal format OtakuDesu, mis. "5 Jul" atau "23 Jun 2026". */
export function parseIdReleaseDate(raw?: string): Date | null {
  if (!raw) return null;
  const parts = raw.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;
  const day = parseInt(parts[0], 10);
  const month = ID_MONTHS[parts[1].slice(0, 3)];
  if (isNaN(day) || month === undefined) return null;
  const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
  const d = new Date(year, month, day);
  // Kalau hasilnya jauh di masa depan (>30 hari), berarti itu tanggal tahun lalu
  if (d.getTime() - Date.now() > 30 * 86400_000) d.setFullYear(d.getFullYear() - 1);
  return d;
}

export function daysSinceRelease(raw?: string): number | null {
  const d = parseIdReleaseDate(raw);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400_000);
}

/** Jam (desimal) sejak tanggal rilis terakhir OtakuDesu (dari string date, bukan AniList). */
export function hoursSinceRelease(raw?: string): number | null {
  const d = parseIdReleaseDate(raw);
  if (!d) return null;
  return (Date.now() - d.getTime()) / 3_600_000;
}

/**
 * Timestamp Unix (detik) episode TERAKHIR yang sudah tayang, seakurat mungkin.
 * Prioritas:
 *  1. AniList `nextAiringAt` (timestamp presisi jam:menit) dikurangi 7 hari — anime
 *     rilis mingguan jadi episode sebelumnya = tepat 7 hari sebelum episode berikutnya.
 *  2. Fallback: tanggal rilis dari OtakuDesu (cuma presisi hari, dianggap tayang 00:00 lokal).
 * Dipakai untuk badge NewEps/NewRilis (rolling 24 jam sejak rilis, BUKAN "hari kalender
 * yang sama" — itu bug lama: eps rilis jam 23:59 cuma dapat badge ~1 menit sebelum
 * ganti hari, seharusnya 24 jam penuh).
 */
export function resolveLastAiredAt(nextAiringAt?: number | null, lastReleaseRaw?: string): number | null {
  if (nextAiringAt) {
    const candidate = nextAiringAt - 7 * 86400;
    if (candidate * 1000 <= Date.now()) return candidate;
  }
  const d = parseIdReleaseDate(lastReleaseRaw);
  return d ? Math.floor(d.getTime() / 1000) : null;
}

/** Jam (desimal) sejak episode terakhir tayang, pakai sumber paling presisi yang tersedia. */
export function hoursSinceLastAired(nextAiringAt?: number | null, lastReleaseRaw?: string): number | null {
  const t = resolveLastAiredAt(nextAiringAt, lastReleaseRaw);
  if (t === null) return null;
  return (Date.now() / 1000 - t) / 3600;
}

/** Heuristik lokal (instan, tanpa network): status eksplisit ATAU tidak ada
 *  episode baru > 171 jam (7 hari + 3 jam). Dipakai fallback kalau AniList error.
 *  Presisi jam bukan hari — anime yang update jam 23:00 tidak salah dianggap tamat
 *  hanya karena sudah lewat tengah malam (bug hari kalender lama). */
export function isCompletedHeuristic(anime: {
  status?: string;
  latestReleaseDate?: string;
  lastReleaseDate?: string;
}): boolean {
  if (anime.status && anime.status.toLowerCase() !== "ongoing") return true;
  const hours = hoursSinceRelease(anime.latestReleaseDate || anime.lastReleaseDate);
  return hours !== null && hours >= STALE_HOURS_THRESHOLD;
}

// ── Cache status AniList per judul (sync getter dari cache fetchAniListRichByTitle) ──
const statusMem = new Map<string, string | null>();

function getCachedStatus(title: string): string | null | undefined {
  const key = cleanAnimeTitle(title).toLowerCase();
  if (!key) return null;
  if (statusMem.has(key)) return statusMem.get(key);
  return undefined; // belum pernah di-fetch
}

async function warmStatus(title: string): Promise<string | null> {
  const key = cleanAnimeTitle(title).toLowerCase();
  if (!key) return null;
  if (statusMem.has(key)) return statusMem.get(key) ?? null;
  try {
    const rich = await fetchAniListRichByTitle(title);
    const status = rich?.status ?? null;
    statusMem.set(key, status);
    return status;
  } catch {
    statusMem.set(key, null);
    return null;
  }
}

/** Cek final: AniList FINISHED = instan tamat, AniList RELEASING = instan ongoing
 *  (override heuristik lokal karena data AniList lebih akurat), kalau AniList nggak
 *  tahu/error baru pakai heuristik tanggal rilis. */
export function isCompleted(anime: {
  title: string;
  status?: string;
  latestReleaseDate?: string;
  lastReleaseDate?: string;
}): boolean {
  const s = getCachedStatus(anime.title);
  if (s === "FINISHED") return true;
  if (s === "RELEASING") return false;
  return isCompletedHeuristic(anime);
}

/** Hook per-card: instan render pakai heuristik, lalu upgrade begitu status AniList kebaca. */
export function useIsCompleted(anime: {
  title: string;
  status?: string;
  latestReleaseDate?: string;
  lastReleaseDate?: string;
}): boolean {
  const [val, setVal] = useState(() => isCompleted(anime));
  useEffect(() => {
    let alive = true;
    warmStatus(anime.title).then(() => { if (alive) setVal(isCompleted(anime)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anime.title, anime.status, anime.latestReleaseDate, anime.lastReleaseDate]);
  return val;
}

/** Hook untuk halaman list (Home/Schedule): progresif cek status AniList untuk
 *  sekumpulan judul, dan return Set judul (lowercase, cleaned) yang FINISHED.
 *  Di-stagger biar nggak nembak rate-limit AniList sekaligus. */
export function useAniListFinishedTitles(titles: string[]): Set<string> {
  const [, forceTick] = useState(0);
  const fetchedRef = useRef<Set<string>>(new Set());

  const toFetch = useMemo(
    () => titles.filter((t) => {
      const key = cleanAnimeTitle(t).toLowerCase();
      return key && !statusMem.has(key) && !fetchedRef.current.has(key);
    }),
    [titles]
  );

  useEffect(() => {
    if (toFetch.length === 0) return;
    toFetch.forEach((title, idx) => {
      const key = cleanAnimeTitle(title).toLowerCase();
      fetchedRef.current.add(key);
      setTimeout(() => {
        warmStatus(title).then(() => forceTick((n) => n + 1));
      }, idx * 350);
    });
  }, [toFetch]);

  return useMemo(() => {
    const set = new Set<string>();
    for (const t of titles) {
      const key = cleanAnimeTitle(t).toLowerCase();
      if (key && statusMem.get(key) === "FINISHED") set.add(key);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titles, toFetch.length]);
}

/** Hook pasangan dari useAniListFinishedTitles — return Set judul yang AniList
 *  konfirmasi masih RELEASING. Dipakai sebagai override positif: kalau AniList
 *  bilang RELEASING, anime wajib tetap ongoing walau ada di completedIds
 *  (kasus hiatus berakhir / episode baru muncul lagi). */
export function useAniListReleasingTitles(titles: string[]): Set<string> {
  const [, forceTick] = useState(0);
  const fetchedRef = useRef<Set<string>>(new Set());

  const toFetch = useMemo(
    () => titles.filter((t) => {
      const key = cleanAnimeTitle(t).toLowerCase();
      return key && !statusMem.has(key) && !fetchedRef.current.has(key);
    }),
    [titles]
  );

  useEffect(() => {
    if (toFetch.length === 0) return;
    toFetch.forEach((title, idx) => {
      const key = cleanAnimeTitle(title).toLowerCase();
      fetchedRef.current.add(key);
      setTimeout(() => {
        warmStatus(title).then(() => forceTick((n) => n + 1));
      }, idx * 350);
    });
  }, [toFetch]);

  return useMemo(() => {
    const set = new Set<string>();
    for (const t of titles) {
      const key = cleanAnimeTitle(t).toLowerCase();
      if (key && statusMem.get(key) === "RELEASING") set.add(key);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titles, toFetch.length]);
}

export function titleKey(title: string): string {
  return cleanAnimeTitle(title).toLowerCase();
}
