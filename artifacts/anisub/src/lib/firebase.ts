import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

function parseConfig(): Record<string, string> | null {
  try {
    const raw: string = import.meta.env.VITE_FIREBASE_CONFIG;
    if (!raw) return null;
    // Format 1: plain JSON
    try { return JSON.parse(raw); } catch {}
    // Format 2: Firebase HTML/JS snippet — ekstrak field satu per satu
    const fields = ["apiKey","authDomain","databaseURL","projectId","storageBucket","messagingSenderId","appId","measurementId"] as const;
    const cfg: Record<string, string> = {};
    for (const f of fields) {
      const m = raw.match(new RegExp(f + ':\\s*["\']([^"\']+)["\']'));
      if (m) cfg[f] = m[1];
    }
    return Object.keys(cfg).length > 0 ? cfg : null;
  } catch { return null; }
}

const cfg = parseConfig();

export const firebaseReady = !!(cfg?.apiKey);
export const databaseURL: string = (cfg?.databaseURL as string | undefined)?.replace(/\/$/, "") ?? "";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

if (firebaseReady && cfg) {
  try {
    _app = getApps().length ? getApps()[0] : initializeApp(cfg);
    _auth = getAuth(_app);
    _db = getFirestore(_app);
  } catch (e) {
    console.warn("[firebase] init failed:", e);
  }
}

export const firebaseApp = _app;
export const auth = _auth;
export const db = _db;
