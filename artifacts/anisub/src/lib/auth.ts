import {
  signOut as fbSignOut, onAuthStateChanged, type User,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export type { User };

export async function signOut(): Promise<void> {
  if (!auth) return;
  await fbSignOut(auth);
}

export function onAuth(cb: (user: User | null) => void): () => void {
  if (!auth) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, cb);
}

// ── Firestore data sync ────────────────────────────────────────────────────────
const KEYS = {
  watchlist: "anisub_watchlist",
  history: "anisub_history",
  favorites: "anisub_favorites",
  profile: "anisub_profile",
  progress: "anisub_watch_progress",
};

function readLocal() {
  const get = <T>(k: string, fallback: T): T => {
    try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? fallback; } catch { return fallback; }
  };
  return {
    profile: get<Record<string, unknown> | null>(KEYS.profile, null),
    watchlist: get<unknown[]>(KEYS.watchlist, []),
    history: get<unknown[]>(KEYS.history, []),
    favorites: get<string[]>(KEYS.favorites, []),
    progress: get<Record<string, unknown>>(KEYS.progress, {}),
  };
}

function writeLocal(data: ReturnType<typeof readLocal>) {
  const set = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  if (data.profile) set(KEYS.profile, data.profile);
  set(KEYS.watchlist, data.watchlist);
  set(KEYS.history, data.history);
  set(KEYS.favorites, data.favorites);
  set(KEYS.progress, data.progress);
}

export function hasLocalData(): boolean {
  const local = readLocal();
  return !!(local.watchlist.length || local.history.length || local.favorites.length || local.profile);
}

export async function uploadToFirestore(uid: string): Promise<void> {
  if (!db) return;
  const local = readLocal();
  await setDoc(doc(db, "users", uid), { ...local, updatedAt: Date.now(), uid }, { merge: true });
}

export async function downloadFromFirestore(uid: string): Promise<boolean> {
  if (!db) return false;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return false;
    const data = snap.data();
    writeLocal({
      profile: data.profile ?? null,
      watchlist: data.watchlist ?? [],
      history: data.history ?? [],
      favorites: data.favorites ?? [],
      progress: data.progress ?? {},
    });
    return true;
  } catch { return false; }
}

let _syncTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleSync(uid: string) {
  if (!db) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => uploadToFirestore(uid), 4000);
}
