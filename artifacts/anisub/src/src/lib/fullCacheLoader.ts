/**
 * Full Cache Loader — download data lengkap semua anime dari GitHub Releases
 * ke IndexedDB saat pertama kali web/APK dibuka.
 *
 * Hanya berjalan satu kali per 7 hari. Setelah itu data tersimpan permanent
 * di IndexedDB dan web/APK tidak perlu download ulang.
 *
 * Format IDB sama persis dengan preloader APK supaya keduanya share cache.
 */
import { get as idbGet, set as idbSet, createStore } from "idb-keyval";

// Gunakan store yang sama dengan persistentCache.ts dan preloader APK
const store = createStore("anisub-cache-v1", "kv");

// Gunakan API server sebagai proxy untuk menghindari CORS restriction GitHub Releases
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";
// Di dev mode (Replit preview proxy) file 21MB timeout — loader hanya jalan di production build
const IS_DEV = import.meta.env.DEV;
const CACHE_META_KEY = "__anisub_cache_meta__";
const CACHE_VALID_MS = 7 * 24 * 3600_000; // 7 hari

interface CacheMeta {
  cachedAt: number;
  total: number;
  cacheUrl?: string;
}

interface CacheUrlConfig {
  fullCacheUrl?: string;
  totalAnime?: number;
  updatedAt?: string;
  releaseTag?: string;
}

let _started = false;

/**
 * Mulai proses auto-download cache. Aman dipanggil berkali-kali — hanya berjalan sekali.
 * Tidak blocking — berjalan di background, tidak ganggu render halaman.
 */
export function startFullCacheLoader(): void {
  if (_started) return;
  _started = true;
  // Fire-and-forget, tidak perlu await
  runLoader().catch(() => {/* silent — cache gagal download, web tetap berjalan dari API */});
}

async function runLoader(): Promise<void> {
  // Di dev mode (Replit preview proxy) file 21MB akan timeout — skip saja.
  // Cache ini untuk production build / APK, bukan dev preview.
  if (IS_DEV) return;

  // 1. Cek apakah cache sudah ada dan masih valid
  let meta: CacheMeta | undefined;
  try {
    meta = await idbGet<CacheMeta>(CACHE_META_KEY, store);
  } catch {
    // IndexedDB tidak tersedia (mode private / browser lama) → skip
    return;
  }

  const now = Date.now();
  if (meta && meta.cachedAt && (now - meta.cachedAt) < CACHE_VALID_MS && (meta.total ?? 0) > 0) {
    // Cache masih valid, tidak perlu download
    return;
  }

  // 2. Ambil info URL cache dari API server (proxy, tidak ada CORS issue)
  let cacheUrl: string | undefined;
  try {
    const cfgRes = await fetch(`${BASE_URL}/cache/urls`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (cfgRes.ok) {
      const cfg = (await cfgRes.json()) as CacheUrlConfig;
      cacheUrl = cfg.fullCacheUrl; // simpan untuk meta saja
    }
  } catch {
    // Gagal fetch config — skip
  }

  // 3. Download full cache JSON via API proxy (server-side, tidak ada CORS)
  // ?v=3 — cache-buster supaya browser tidak pakai cached redirect lama
  let animeArr: Record<string, unknown>[];
  try {
    const dataRes = await fetch(`${BASE_URL}/cache/full?v=3`, {
      signal: AbortSignal.timeout(300_000), // 5 menit untuk file besar
    });
    if (!dataRes.ok) return;
    const data = (await dataRes.json()) as { anime?: Record<string, unknown>[] };
    animeArr = data.anime ?? [];
    if (animeArr.length === 0) return;
  } catch {
    return; // Download gagal (jaringan/timeout) — coba session berikutnya
  }

  // 4. Simpan ke IndexedDB dalam batch (sama format dengan preloader APK)
  const ts = Date.now();
  const CHUNK = 100;
  try {
    for (let i = 0; i < animeArr.length; i += CHUNK) {
      const chunk = animeArr.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async (a) => {
          const animeId = (a.animeId as string) || (a.id as string);
          if (!animeId) return;
          await idbSet(
            `anisub_detail_v1:${animeId}`,
            { d: a, ts, permanent: true },
            store,
          );
        }),
      );
    }

    // 5. Simpan metadata supaya sesi berikutnya tidak download lagi
    await idbSet(
      CACHE_META_KEY,
      { cachedAt: ts, total: animeArr.length, cacheUrl } satisfies CacheMeta,
      store,
    );

    // 6. Simpan light list ke localStorage untuk list view cepat (sama dengan preloader)
    try {
      const light = animeArr.map((a) => ({
        animeId: a.animeId ?? a.id,
        title: a.title,
        poster: a.posterHD ?? a.poster,
        banner: a.banner,
        genres: a.genres,
        score: a.score,
        status: a.status,
        episodes: a.episodes,
        seasonYear: a.seasonYear,
        listStatus: a.listStatus,
        anilistId: a.anilistId,
        trailer: a.trailer,
      }));
      localStorage.setItem("__apk_loaded", "1");
      localStorage.setItem("__apk_total", String(animeArr.length));
      const LCHUNK = 200;
      for (let j = 0; j < light.length; j += LCHUNK) {
        try {
          localStorage.setItem(
            `__apk_light_${Math.floor(j / LCHUNK)}`,
            JSON.stringify(light.slice(j, j + LCHUNK)),
          );
        } catch { /* quota — skip */ }
      }
    } catch { /* localStorage tidak tersedia */ }
  } catch {
    // Simpan ke IDB gagal (quota/mode private) — tidak fatal
  }
}
