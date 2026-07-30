import type { AniListRichData } from "./anilist";

/** Format unix timestamp (detik) jadi tanggal+jam WIB — dipakai buat "release time" episode. */
export function fmtEpDate(unixSec: number): string {
  const date = new Date(unixSec * 1000);
  const str = date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return str.replace(",", " ·") + " WIB";
}

/** Tentuin anime udah tamat atau belum: AniList FINISHED (instan), status OtakuDesu
 *  "Completed" (instan), atau heuristik — nggak ada episode baru 7+ hari (fallback). */
export function computeIsFinished(opts: {
  aniListStatus?: string | null;
  otakuDesuStatus?: string | null;
  airingNodes?: { episode: number; airingAt: number }[];
}): boolean {
  const isAniListFinished = opts.aniListStatus === "FINISHED";
  const isOtakuDesuCompleted = opts.otakuDesuStatus === "Completed";
  const nodes = opts.airingNodes ?? [];
  const lastAiredAt = nodes.length ? Math.max(...nodes.map((n) => n.airingAt)) : 0;
  const sevenDaysAgo = Date.now() / 1000 - 7 * 86400;
  const isStaleFinished =
    lastAiredAt > 0 &&
    lastAiredAt < sevenDaysAgo &&
    !nodes.some((n) => n.airingAt > Date.now() / 1000);
  return isAniListFinished || isOtakuDesuCompleted || isStaleFinished;
}

/**
 * Bangun map episode -> unix timestamp rilis dari data AniList airingSchedule.
 * Hanya menampilkan tanggal yang benar-benar valid dari AniList.
 * TIDAK lagi generate tanggal palsu saat AniList tidak tersedia — biar lebih akurat.
 */
export function buildCompleteAirMap(
  nodes: { episode: number; airingAt: number }[],
  totalEps: number
): Map<number, number> {
  const map = new Map<number, number>();
  if (!nodes.length) {
    // Tidak ada data AniList → kembalikan map kosong, jangan tampilkan tanggal palsu.
    return map;
  }
  const sorted = [...nodes].sort((a, b) => a.episode - b.episode);
  for (const n of sorted) map.set(n.episode, n.airingAt);

  let totalInterval = 0, count = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].airingAt - sorted[i - 1].airingAt;
    if (diff > 0 && diff < 14 * 86400) { totalInterval += diff; count++; }
  }
  const avgInterval = count > 0 ? totalInterval / count : 7 * 86400;

  // Ekstrapolasi HANYA untuk episode yang belum ada datanya, pakai interval rata-rata
  for (let ep = 1; ep <= totalEps; ep++) {
    if (!map.has(ep)) {
      const closest = sorted.reduce((prev, cur) =>
        Math.abs(cur.episode - ep) < Math.abs(prev.episode - ep) ? cur : prev
      );
      map.set(ep, Math.round(closest.airingAt + (ep - closest.episode) * avgInterval));
    }
  }
  return map;
}

function seededRand(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** Estimasi jumlah viewer per episode — deterministik (seeded by episodeId) biar
 *  konsisten tiap kali dilihat, tapi keliatan "hidup" (premiere/finale lebih tinggi). */
export function estimateViewers(
  episodeId: string, epNum: number, totalEps: number,
  popularity: number | null | undefined, isFinished: boolean
): number {
  const pop = Math.max(popularity ?? 0, 500);
  const base = pop * 0.15;
  const r = seededRand(episodeId);
  const r2 = seededRand(episodeId + "_v2");
  const pos = totalEps > 1 ? (epNum - 1) / (totalEps - 1) : 0;
  let mult: number;
  if (pos < 0.08) mult = 1.8 + r * 1.4;
  else if (pos > 0.88 && isFinished) mult = 0.8 + r * 0.9;
  else mult = 0.35 + r * 0.75 + r2 * 0.2;
  return Math.max(Math.round(base * mult), 120);
}

/**
 * Format jumlah penonton jadi angka penuh Indonesian-style.
 * Contoh: 10737 → "10.737", 1234567 → "1,2jt"
 * Angka di bawah 1 juta ditampilkan lengkap supaya lebih akurat.
 */
export function formatViewers(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "jt";
  return n.toLocaleString("id-ID");
}

// ── Real watch count tracker (localStorage) ───────────────────────────────────
const WATCH_COUNT_KEY = "anisub_watch_count_v1";

/** Ambil jumlah tontonan nyata dari AniSub untuk episode tertentu. */
export function getWatchCount(episodeId: string): number {
  try {
    const store = JSON.parse(localStorage.getItem(WATCH_COUNT_KEY) ?? "{}") as Record<string, number>;
    return store[episodeId] ?? 0;
  } catch { return 0; }
}

/** Increment watch count — dipanggil satu kali saat user mulai nonton episode. */
export function incrementWatchCount(episodeId: string): void {
  try {
    const store = JSON.parse(localStorage.getItem(WATCH_COUNT_KEY) ?? "{}") as Record<string, number>;
    store[episodeId] = (store[episodeId] ?? 0) + 1;
    // Batasi ukuran store (maks 500 entry — hapus yang lama)
    const entries = Object.entries(store);
    if (entries.length > 500) {
      const trimmed = Object.fromEntries(entries.slice(-500));
      localStorage.setItem(WATCH_COUNT_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(WATCH_COUNT_KEY, JSON.stringify(store));
    }
  } catch {}
}

export function buildEpisodeMeta(rich: AniListRichData | null | undefined, totalEps: number) {
  const airDateMap = buildCompleteAirMap(rich?.airingSchedule?.nodes ?? [], totalEps);
  const isFinished = computeIsFinished({
    aniListStatus: rich?.status,
    airingNodes: rich?.airingSchedule?.nodes,
  });
  return {
    airDateMap,
    isFinished,
    getViewers: (episodeId: string, epNum: number) =>
      estimateViewers(episodeId, epNum, totalEps, rich?.popularity, isFinished) + getWatchCount(episodeId),
  };
}
