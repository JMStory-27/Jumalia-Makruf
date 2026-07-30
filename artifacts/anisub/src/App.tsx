import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { get as idbGet, set as idbSet, del as idbDel, createStore } from "idb-keyval";
import { Toaster } from "@/components/ui/toaster";
import { Bell, Search } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import RankUpOverlay from "@/components/RankUpOverlay";
import NotificationPanel from "@/components/NotificationPanel";
import { getTheme, applyTheme, getProfile, getRank, getLastRank, saveLastRank } from "@/lib/storage";
import {
  getUnreadCount, generateDailyNotifications,
  generateWelcomeBack, requestNotifPermission,
  registerServiceWorker, fetchAdminNotificationsFromGithub,
} from "@/lib/notifications";
import { AuthProvider } from "@/lib/authContext";
import { requestPersistentStorage } from "@/lib/persistentCache";
import { preloadBannerCache } from "@/lib/anilist";
import { startFullCacheLoader } from "@/lib/fullCacheLoader";

// ── Code splitting — setiap halaman hanya di-load saat pertama kali dibuka ───
const Home          = lazy(() => import("@/pages/Home"));
const SearchPage    = lazy(() => import("@/pages/Search"));
const AnimeDetail   = lazy(() => import("@/pages/AnimeDetail"));
const Watch         = lazy(() => import("@/pages/Watch"));
const Profile       = lazy(() => import("@/pages/Profile"));
const Watchlist     = lazy(() => import("@/pages/Watchlist"));
const History       = lazy(() => import("@/pages/History"));
const Schedule      = lazy(() => import("@/pages/Schedule"));
const SeasonsPage   = lazy(() => import("@/pages/Seasons"));
const UpcomingDetailPage = lazy(() => import("@/pages/UpcomingDetail"));
const NobarPage     = lazy(() => import("@/pages/Nobar"));
const AdminScrape   = lazy(() => import("@/pages/AdminScrape"));
const NotFound      = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div style={{ minHeight: "100dvh", background: "#05050f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%",
        border: "3px solid rgba(255,255,255,0.07)",
        borderTopColor: "#FB923C",
        animation: "spin 0.7s linear infinite",
      }} />
    </div>
  );
}

const RANK_COLORS: Record<string, string> = {
  F: "#6E6E90", E: "#94A3B8", D: "#5865F2", C: "#57F287",
  B: "#FEE75C", A: "#EB459E", S: "#FF6B00", SS: "#FF4444", SSS: "#FF0000",
};
const RANK_BORDERS: Record<string, string> = {
  F: "#6E6E9044", E: "#94A3B855", D: "#5865F288", C: "#57F28788",
  B: "#FEE75C88", A: "#EB459Ecc", S: "#FF6B00", SS: "#FF4444", SSS: "#FF0000",
};
const CHIBI_AVATARS = ["🦊", "🐉", "🌸", "⚡", "🌙", "🔥", "💫", "👁️", "🐺", "🦁", "🐼", "🦋", "🌊", "⚔️", "🎭", "🌟"];

function HomeActions({ onBell }: { onBell: () => void }) {
  const [, setLocation] = useLocation();
  const [unread, setUnread] = useState(getUnreadCount);
  const profile = getProfile();
  const rank = getRank(profile.xp);
  const customAvatar = (() => { try { return localStorage.getItem("lawnime_custom_avatar") || null; } catch { return null; } })();

  useEffect(() => {
    const t = setInterval(() => setUnread(getUnreadCount()), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "fixed", top: 12, right: 12, zIndex: 50, display: "flex", alignItems: "center", gap: 7 }}>
      <button
        onClick={() => setLocation("/search")}
        style={{
          width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(10,10,22,0.85)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        title="Cari Anime"
      >
        <Search size={15} color="rgba(255,255,255,0.75)" />
      </button>
      <button
        onClick={onBell}
        style={{
          width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(10,10,22,0.85)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)", position: "relative",
        }}
        title="Notifikasi"
      >
        <Bell size={15} color="rgba(255,255,255,0.75)" />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: 5, right: 5, width: 8, height: 8, borderRadius: "50%",
            background: "#FF4444", boxShadow: "0 0 6px rgba(255,68,68,0.9)",
            animation: "live-dot 1.4s ease-in-out infinite",
          }} />
        )}
      </button>
      <button
        onClick={() => setLocation("/profile")}
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999,
          background: "rgba(10,10,22,0.85)", backdropFilter: "blur(12px)",
          border: `1.5px solid ${RANK_BORDERS[rank] ?? "#6E6E9044"}`,
          boxShadow: `0 0 12px ${RANK_COLORS[rank] ?? "#6E6E90"}22`,
        }}
        title="Profil"
      >
        {customAvatar ? (
          <div style={{ width: 20, height: 20, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
            <img src={customAvatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : (
          <span style={{ fontSize: 16, lineHeight: 1 }}>{CHIBI_AVATARS[profile.avatarId % CHIBI_AVATARS.length] ?? "🦊"}</span>
        )}
        <span style={{ fontSize: 10, fontWeight: 900, color: RANK_COLORS[rank] ?? "#94A3B8" }}>{rank}</span>
      </button>
    </div>
  );
}

// ── QueryClient — staleTime 5 menit, gcTime 1 tahun ──────────────────────────
// gcTime dinaikkan dari 24 jam → 1 tahun karena seluruh cache query sekarang
// di-persist ke IndexedDB (lihat asyncStoragePersister di bawah): begitu app dibuka lagi,
// data lama (ongoing/completed/schedule/genre/scrape-status/detail/episode) langsung tampil
// instan dari cache sambil di-refresh diam-diam di background sesuai staleTime masing-masing
// query — jadi user nggak pernah lihat halaman kosong/loading lama pas buka ulang AniSub.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 365 * 24 * 60 * 60 * 1000,
    },
  },
});

// ── Persist seluruh react-query cache ke IndexedDB (bukan localStorage — unlimited-ish) ──
// PENTING: beberapa query (mis. fetchAllOngoingMap) resolve ke Map, dan Map BUKAN JSON-safe —
// JSON.stringify(Map) jadi "{}" kosong, jadi setelah rehydrate dari IndexedDB, ".get()" hilang
// dan app crash ("ongoingMap.get is not a function"). Serialize/deserialize custom di bawah
// menyimpan Map sebagai tag khusus {__map:[...entries]} lalu direkonstruksi balik jadi Map asli
// saat load, supaya SEMUA query (termasuk yang cache-nya berupa Map) tetap benar setelah reload.
function mapSafeReplacer(_key: string, value: unknown) {
  if (value instanceof Map) return { __map: Array.from(value.entries()) };
  if (value instanceof Set) return { __set: Array.from(value.values()) };
  return value;
}
function mapSafeReviver(_key: string, value: unknown) {
  if (value && typeof value === "object") {
    if ("__map" in (value as Record<string, unknown>)) {
      return new Map((value as { __map: [unknown, unknown][] }).__map);
    }
    if ("__set" in (value as Record<string, unknown>)) {
      return new Set((value as { __set: unknown[] }).__set);
    }
  }
  return value;
}

const persistStore = createStore("anisub-query-cache-v1", "kv");
const asyncStoragePersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => idbGet(key, persistStore),
    setItem: (key, value) => idbSet(key, value, persistStore),
    removeItem: (key) => idbDel(key, persistStore),
  },
  // Key dinaikkan ke v2 — cache lama (sebelum fix Map/Set-safe serialize) tersimpan
  // sebagai objek kosong "{}" begitu Map/Set di-JSON.stringify polos, bikin app crash
  // ("ongoingMap.get is not a function") begitu cache lama itu dibaca lagi. Ganti key
  // = mulai bersih, cache baru otomatis tersimpan dengan format Map/Set-safe di atas.
  key: "ANISUB_QUERY_CACHE_V2",
  throttleTime: 1000,
  serialize: (data) => JSON.stringify(data, mapSafeReplacer),
  deserialize: (str) => JSON.parse(str, mapSafeReviver),
});

function AnimatedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <div className="page-enter">
      <Component />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/"           component={() => <AnimatedRoute component={Home} />} />
        <Route path="/search"     component={() => <AnimatedRoute component={SearchPage} />} />
        <Route path="/anime/:animeId" component={() => <AnimatedRoute component={AnimeDetail} />} />
        <Route path="/watch/:episodeId" component={() => <AnimatedRoute component={Watch} />} />
        <Route path="/watchlist"  component={() => <AnimatedRoute component={Watchlist} />} />
        <Route path="/history"    component={() => <AnimatedRoute component={History} />} />
        <Route path="/schedule"   component={() => <AnimatedRoute component={Schedule} />} />
        <Route path="/seasons"    component={() => <AnimatedRoute component={SeasonsPage} />} />
        <Route path="/upcoming/:id" component={() => <AnimatedRoute component={UpcomingDetailPage} />} />
        <Route path="/profile"    component={() => <AnimatedRoute component={Profile} />} />
        <Route path="/nobar"      component={() => <AnimatedRoute component={NobarPage} />} />
        <Route path="/admin/scrape" component={() => <AnimatedRoute component={AdminScrape} />} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppShell() {
  const [location, setLocation] = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const isWatch = location.includes("/watch/");
  const isHome = location === "/";

  return (
    <div style={{ minHeight: "100dvh", background: "#05050f" }}>
      <Router />
      {!isWatch && <BottomNav />}
      {isHome && <HomeActions onBell={() => setNotifOpen(true)} />}
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <Toaster />
    </div>
  );
}

function AppInner() {
  const [rankUp, setRankUp] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    requestPersistentStorage();
    // Mulai download full cache dari GitHub Releases ke IndexedDB (fire-and-forget).
    // Hanya berjalan sekali per 7 hari. Data yang sudah di-cache tidak di-download ulang.
    // Ini memastikan web dan APK sama-sama punya data lengkap tanpa loading ulang.
    startFullCacheLoader();
    // Preload semua banner dari IndexedDB ke memory — SmartPoster/useBanner langsung
    // render instan dari memory tanpa nunggu async IDB per-kartu.
    preloadBannerCache().then(() => {
      // Mulai background prefetch setelah banner cache warm (30s delay internal)
      import("@/lib/prefetchAll").then(({ startBackgroundPrefetch }) =>
        startBackgroundPrefetch()
      );
    });
    registerServiceWorker();
    const profile = getProfile();
    generateWelcomeBack(profile.username);

    import("@/lib/api").then(({ fetchOngoing }) =>
      fetchOngoing(1).then(data => {
        const list = (data?.animeList ?? []).map((a: { title: string; animeId: string; poster?: string }) => ({
          title: a.title, animeId: a.animeId, poster: a.poster,
        }));
        generateDailyNotifications(list);
      }).catch(() => {})
    );

    requestNotifPermission();
    fetchAdminNotificationsFromGithub();
    const pollInterval = setInterval(() => fetchAdminNotificationsFromGithub(), 5_000);

    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "PUSH_RECEIVED") fetchAdminNotificationsFromGithub();
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    return () => {
      clearInterval(pollInterval);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  useEffect(() => {
    const theme = getTheme();
    applyTheme(theme);

    const onStorage = (e: StorageEvent) => {
      if (e.key === "anisub_theme" && (e.newValue === "dark" || e.newValue === "light")) {
        applyTheme(e.newValue);
      }
      if (e.key === "anisub_profile") {
        try {
          const profile = JSON.parse(e.newValue ?? "{}");
          const newRank = getRank(profile.xp ?? 0);
          const lastRank = getLastRank();
          const RANK_ORDER = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];
          if (RANK_ORDER.indexOf(newRank) > RANK_ORDER.indexOf(lastRank)) {
            setRankUp({ from: lastRank, to: newRank });
            saveLastRank(newRank);
          }
        } catch { /* ignore */ }
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const profile = getProfile();
    const currentRank = getRank(profile.xp);
    const lastRank = getLastRank();
    const RANK_ORDER = ["F", "E", "D", "C", "B", "A", "S", "SS", "SSS"];
    if (RANK_ORDER.indexOf(currentRank) > RANK_ORDER.indexOf(lastRank)) {
      setRankUp({ from: lastRank, to: currentRank });
      saveLastRank(currentRank);
    }
  }, []);

  const handleRankDone = useCallback(() => setRankUp(null), []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: asyncStoragePersister, maxAge: 365 * 24 * 60 * 60 * 1000 }}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AppShell />
      </WouterRouter>
      {rankUp && (
        <RankUpOverlay
          fromRank={rankUp.from}
          toRank={rankUp.to}
          onDone={handleRankDone}
        />
      )}
    </PersistQueryClientProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
