/**
 * Persistent cache layer backed by IndexedDB (bukan localStorage).
 *
 * Kenapa pindah dari localStorage:
 * - localStorage cuma ~5-10MB per origin, dan cache lama (anisub_rich_v2, anisub_person_v1, dst)
 *   nyimpen SATU blob JSON gede berisi semua entry — begitu kepenuhan, `localStorage.setItem`
 *   throw QuotaExceededError yang di-swallow diam-diam (try/catch kosong) → cache baru gagal
 *   tersimpan padahal kelihatan "berhasil", makanya suka ke-reset / lama lagi loading-nya.
 * - IndexedDB kapasitasnya jauh lebih besar (ratusan MB–GB, tergantung browser & disk),
 *   dan tiap entry disimpan sebagai record terpisah (bukan satu blob), jadi nggak ada
 *   masalah "satu title gede bikin semua entry lain ikut gagal tersimpan".
 *
 * Setiap entry punya flag `permanent`: kalau true, TIDAK PERNAH dianggap stale/expired —
 * dipakai untuk anime yang datanya sudah lengkap (poster/banner + trailer + sinopsis +
 * staff + karakter & pengisi suara) supaya nggak perlu di-fetch ulang lagi selamanya.
 */
import { get as idbGet, set as idbSet, del as idbDel, createStore, keys as idbKeys } from "idb-keyval";

const store = createStore("anisub-cache-v1", "kv");

interface Envelope<T> {
  d: T;
  ts: number;
  /** Kalau true, entry ini dianggap selalu fresh — tidak pernah expired. */
  permanent?: boolean;
}

// Minta browser untuk tidak mengevict storage ini di bawah tekanan disk (best-effort,
// browser modern biasanya langsung grant untuk PWA/site yang sering dipakai).
let persistRequested = false;
export async function requestPersistentStorage(): Promise<void> {
  if (persistRequested) return;
  persistRequested = true;
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted?.();
      if (!already) await navigator.storage.persist();
    }
  } catch { /* not critical */ }
}

/** Ambil entry dari IndexedDB. Kembalikan null kalau tidak ada / sudah expired (dan bukan permanent). */
export async function idbCacheGet<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const entry = await idbGet<Envelope<T>>(key, store);
    if (!entry) return null;
    if (entry.permanent) return entry.d;
    if (Date.now() - entry.ts < ttlMs) return entry.d;
    return null;
  } catch {
    return null;
  }
}

/** Simpan entry ke IndexedDB. `permanent: true` = cache selamanya, tidak akan expired/re-fetch. */
export async function idbCacheSet<T>(key: string, data: T, opts?: { permanent?: boolean }): Promise<void> {
  try {
    await idbSet(key, { d: data, ts: Date.now(), permanent: !!opts?.permanent } as Envelope<T>, store);
  } catch { /* best-effort — kalau IndexedDB gagal (mode private dsb) ya sudah, lanjut tanpa cache */ }
}

export async function idbCacheDel(key: string): Promise<void> {
  try { await idbDel(key, store); } catch {}
}

export async function idbCacheKeys(): Promise<IDBValidKey[]> {
  try { return await idbKeys(store); } catch { return []; }
}

export { store as anisubIdbStore };
