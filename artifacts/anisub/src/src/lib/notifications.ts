export type NotifType = "episode" | "recommendation" | "admin" | "welcome_back" | "award";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  thumbnail?: string;
  animeId?: string;
  timestamp: number;
  read: boolean;
  adminBadge?: boolean;
}

const KEY = "lawnime_notifications_v2";
const DAILY_KEY = "lawnime_notif_daily_date";

function load(): AppNotification[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function save(list: AppNotification[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 80)));
}

export function getNotifications(): AppNotification[] {
  return load().sort((a, b) => b.timestamp - a.timestamp);
}
export function getUnreadCount(): number {
  return load().filter(n => !n.read).length;
}
export function markRead(id: string) {
  const list = load().map(n => n.id === id ? { ...n, read: true } : n);
  save(list);
}
export function markAllRead() {
  save(load().map(n => ({ ...n, read: true })));
}

// ── Service Worker & Push ─────────────────────────────────────────────────────

let _swReg: ServiceWorkerRegistration | null = null;

const BASE = import.meta.env.BASE_URL;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
    _swReg = reg;

    // Kalau ada SW baru yang waiting, paksa aktif sekarang lalu reload
    const forceUpdate = (sw: ServiceWorker) => {
      sw.postMessage({ type: "SKIP_WAITING" });
    };
    if (reg.waiting) {
      forceUpdate(reg.waiting);
    }
    reg.addEventListener("updatefound", () => {
      const newSw = reg.installing;
      if (!newSw) return;
      newSw.addEventListener("statechange", () => {
        if (newSw.state === "installed" && navigator.serviceWorker.controller) {
          forceUpdate(newSw);
        }
      });
    });

    // Reload sekali saat SW baru mengambil kendali (controller berubah)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    return reg;
  } catch { return null; }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function subscribeToPush(): Promise<boolean> {
  try {
    const reg = _swReg ?? await registerServiceWorker();
    if (!reg) return false;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;

    const res = await fetch("/api/push/vapid-public-key");
    const { key } = await res.json();
    if (!key) return false;

    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing.toJSON()),
      });
      return true;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    return true;
  } catch { return false; }
}

// ── Show system notification via SW (works even in background) ────────────────
async function showSystemNotif(n: Omit<AppNotification, "read">) {
  try {
    const reg = _swReg ?? await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(n.title, {
        body: n.body,
        icon: n.thumbnail || `${BASE}icon-192.png`,
        badge: `${BASE}icon-192.png`,
        tag: n.id,
        renotify: true,
        data: { url: n.animeId ? `${BASE}#anime/${n.animeId}` : BASE },
        vibrate: [200, 100, 200],
        actions: [
          { action: "open", title: "🎬 Buka Lawnime" },
          { action: "dismiss", title: "Tutup" },
        ],
      } as NotificationOptions);
      return;
    }
  } catch {}
  // Fallback: basic notification
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(n.title, { body: n.body, icon: n.thumbnail || `${BASE}icon-192.png` });
    } catch {}
  }
}

function addNotif(n: Omit<AppNotification, "read">) {
  const list = load();
  if (list.find(x => x.id === n.id)) return;
  list.unshift({ ...n, read: false });
  save(list);
  showSystemNotif(n);
}

// ── Daily notifications ───────────────────────────────────────────────────────

const DAILY_NOTIFS: { title: string; body: (a: string) => string; type: NotifType }[] = [
  { title: "🔥 Episode Baru Rilis!", body: a => `${a} baru saja merilis episode terbaru. Jangan sampai ketinggalan!`, type: "episode" },
  { title: "🌟 Rekomendasi Anime", body: a => `${a} cocok banget buat kamu tonton hari ini!`, type: "recommendation" },
  { title: "🏆 Nominasi Anime Terbaik", body: a => `${a} masuk nominasi anime terbaik kategori Action bulan ini!`, type: "award" },
  { title: "🎌 Anime Pilihan Genre Magic", body: a => `${a} masuk kategori Magic terbaik — rating 9.2!`, type: "award" },
  { title: "📅 Update Jadwal", body: a => `${a} akan tayang hari ini. Siapkan waktu nonton kamu!`, type: "episode" },
  { title: "✨ Anime Trending", body: a => `${a} sedang trending di seluruh dunia! Sudah nonton?`, type: "recommendation" },
  { title: "🌸 Musim Baru Dimulai!", body: a => `${a} resmi dimulai musim barunya. Episode 1 sudah tersedia!`, type: "episode" },
  { title: "⭐ Rating Tertinggi Minggu Ini", body: a => `${a} meraih rating tertinggi minggu ini di AniList!`, type: "award" },
  { title: "🎭 Dari Manga Populer", body: a => `${a} adalah adaptasi manga terlaris. Wajib tonton!`, type: "recommendation" },
  { title: "💫 Kejutan! Episode Spesial", body: a => `${a} merilis episode spesial yang tidak boleh kamu lewatkan!`, type: "episode" },
];

export async function generateDailyNotifications(animeList: { title: string; animeId: string; poster?: string }[]) {
  if (!animeList.length) return;
  const today = new Date().toDateString();
  if (localStorage.getItem(DAILY_KEY) === today) return;
  localStorage.setItem(DAILY_KEY, today);

  const shuffled = [...animeList].sort(() => Math.random() - 0.5).slice(0, 10);
  shuffled.forEach((anime, i) => {
    const template = DAILY_NOTIFS[i % DAILY_NOTIFS.length];
    addNotif({
      id: `daily_${today}_${i}`,
      type: template.type,
      title: template.title,
      body: template.body(anime.title),
      thumbnail: anime.poster,
      animeId: anime.animeId,
      timestamp: Date.now() - i * 60_000,
    });
  });
}

export async function generateWelcomeBack(username: string) {
  const BACK_KEY = "lawnime_last_seen";
  const lastSeen = parseInt(localStorage.getItem(BACK_KEY) || "0");
  const now = Date.now();
  const daysSince = (now - lastSeen) / (1000 * 60 * 60 * 24);
  localStorage.setItem(BACK_KEY, String(now));
  if (lastSeen && daysSince >= 2) {
    addNotif({
      id: `welcome_back_${Date.now()}`,
      type: "welcome_back",
      title: `👋 Halo ${username}! Sudah lama!`,
      body: `Sudah ${Math.floor(daysSince)} hari ga nonton. Yuk balik dan lanjutkan animenya!`,
      timestamp: now,
    });
  }
}

// ── Admin Notifications from GitHub ──────────────────────────────────────────

// GitHub Contents API — always returns fresh data (no CDN cache unlike raw.githubusercontent.com)
const GH_NOTIF_API = "https://api.github.com/repos/JMStory-27/Jumalia-Makruf/contents/lawnime-notifications.json";

// ETag cache — GitHub 304s don't count against primary rate limit, so safe to poll every 5s
let _lastETag: string | null = null;

export async function fetchAdminNotificationsFromGithub(): Promise<number> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (_lastETag) headers["If-None-Match"] = _lastETag;

    const res = await fetch(GH_NOTIF_API, { headers, cache: "no-store" });

    // 304 Not Modified = data belum berubah, hemat rate limit
    if (res.status === 304) return 0;
    if (!res.ok) return 0;

    const etag = res.headers.get("ETag");
    if (etag) _lastETag = etag;

    const meta = await res.json();
    const decoded = atob(meta.content.replace(/\n/g, ""));
    const list: AppNotification[] = JSON.parse(decoded);
    if (!Array.isArray(list)) return 0;
    let added = 0;
    for (const n of list) {
      if (!n.id || !n.title || !n.body) continue;
      const existing = load();
      if (existing.find(x => x.id === n.id)) continue;
      const notif = { ...n, type: (n.type || "admin") as NotifType };
      const all = load();
      all.unshift({ ...notif, read: false });
      save(all);
      showSystemNotif(notif);
      added++;
    }
    return added;
  } catch { return 0; }
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    await subscribeToPush();
    return true;
  }
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    await subscribeToPush();
    return true;
  }
  return false;
}
