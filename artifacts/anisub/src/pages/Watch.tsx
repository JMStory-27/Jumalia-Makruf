import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Hls from "hls.js";
import {
  ThumbsUp, ThumbsDown, Download, X, Sun, Send,
  SkipForward, List, Play, Pause, ChevronRight,
  SkipBack, Lock, Unlock, Maximize2, Minimize2, Monitor,
} from "lucide-react";
import { fetchEpisode, fetchServer, flattenServers, fetchAnimeDetail } from "@/lib/api";
import type { EpisodeListItem } from "@/lib/api";
import AnimeAIChat from "@/components/AnimeAIChat";
import { addHistory, saveProgress, getProgress, getServerPref, getProfile } from "@/lib/storage";
import { fetchAniListBannerByTitle, fetchAniListRichByTitle } from "@/lib/anilist";
import { buildEpisodeMeta, fmtEpDate, formatViewers, incrementWatchCount, getWatchCount } from "@/lib/episodeMeta";
import { proxyImg } from "@/lib/utils";

const IFRAME_DEFAULT_DURATION = 1440;
const SKIP_OP_SECONDS = 90;

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type AniSkipResult = { found?: boolean; results?: { interval: { start_time: number; end_time: number }; skip_type: string }[] };

async function fetchAniSkipInterval(malId: number, epNum: number): Promise<{ startTime: number; endTime: number } | null> {
  const tryURL = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = await res.json() as AniSkipResult;
    if (!json.found) return null;
    const op = json.results?.find(r => r.skip_type === "op");
    if (!op) return null;
    return { startTime: op.interval.start_time, endTime: op.interval.end_time };
  };
  try {
    return (
      await tryURL(`https://api.aniskip.com/v2/skip-times/${malId}/${epNum}?types[]=op&episodeLength=0`) ??
      await tryURL(`https://api.aniskip.com/v1/skip-times/${malId}/${epNum}?types[]=op&episodeLength=0`)
    );
  } catch { return null; }
}

async function fetchSkipInterval(animeTitle: string, epNum: number): Promise<{ startTime: number; endTime: number } | null> {
  const base = animeTitle.trim();
  const variants = [base, base.split(":")[0].trim(), base.replace(/\s+(Season|Part|Cour|OVA|Movie)\s*\d*/gi, "").trim(), base.replace(/\s+\d+$/, "").trim()].filter((t, i, a) => t.length > 2 && a.indexOf(t) === i);
  let malId: number | null = null;
  for (const v of variants) {
    const { idMal } = await fetchAniListBannerByTitle(v);
    if (idMal) { malId = idMal; break; }
  }
  if (!malId) return null;
  return fetchAniSkipInterval(malId, epNum);
}

type VendorFullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};
type VendorFullscreenDoc = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

// Try every vendor-prefixed fullscreen entry point — some Android WebViews/in-app
// browsers only implement the webkit-prefixed variant, and silently no-op on the
// standard one. Without this, the OS nav bar (3-button or gesture pill) stays
// visible and eats into the "fill left/right" crop, making it look cut off.
async function requestAppFullscreen(el: HTMLElement) {
  const target = el as VendorFullscreenEl;
  try { if (document.fullscreenElement) return; } catch (_) {}
  try { const r = target.requestFullscreen?.(); if (r) await r; return; } catch (_) {}
  try { const r = target.webkitRequestFullscreen?.(); if (r) await r; return; } catch (_) {}
  try { const r = target.webkitRequestFullScreen?.(); if (r) await r; return; } catch (_) {}
  try { const r = target.mozRequestFullScreen?.(); if (r) await r; return; } catch (_) {}
  try { const r = target.msRequestFullscreen?.(); if (r) await r; return; } catch (_) {}
}
async function exitAppFullscreen() {
  const doc = document as VendorFullscreenDoc;
  try { if (document.fullscreenElement) { const r = document.exitFullscreen?.(); if (r) await r; return; } } catch (_) {}
  try { if (doc.webkitFullscreenElement) { const r = doc.webkitExitFullscreen?.(); if (r) await r; return; } } catch (_) {}
  try { const r = doc.mozCancelFullScreen?.(); if (r) await r; } catch (_) {}
  try { const r = doc.msExitFullscreen?.(); if (r) await r; } catch (_) {}
}

async function lockLandscape() {
  await requestAppFullscreen(document.documentElement);
  try { await (screen.orientation as unknown as { lock: (o: string) => Promise<void> }).lock("landscape"); } catch (_) {}
  try { await (screen.orientation as unknown as { lock: (o: string) => Promise<void> }).lock("landscape-primary"); } catch (_) {}
}
async function unlockOrientation() {
  try { (screen.orientation as unknown as { unlock?: () => void }).unlock?.(); } catch (_) {}
  await exitAppFullscreen();
}

const FORMAT_PREF: Record<string, number> = { mkv: 2, mp4: 1 };
function extractRes(q: string): number {
  const m = q.match(/(\d{3,4})p/i);
  if (m) return parseInt(m[1], 10);
  const lo = q.toLowerCase();
  if (lo.includes("1080") || lo.includes("fhd")) return 1080;
  if (lo.includes("720") || lo.includes("hd")) return 720;
  if (lo.includes("480") || lo.includes("sd")) return 480;
  if (lo.includes("360")) return 360;
  return 0;
}
function qualityScore(q: string) {
  const res = extractRes(q);
  const fmt = Object.entries(FORMAT_PREF).find(([k]) => q.toLowerCase().includes(k));
  return res * 10 + (fmt ? fmt[1] : 0);
}
function pickBestQuality(qualities: string[]): string | null {
  if (!qualities.length) return null;
  return qualities.reduce((best, q) => qualityScore(q) >= qualityScore(best) ? q : best);
}
function sortQualities(qualities: string[]): string[] {
  return [...qualities].sort((a, b) => qualityScore(b) - qualityScore(a));
}

// ── Comment system ────────────────────────────────────────────────────────────
type ReplyItem = { id: string; username: string; text: string; timestamp: number };
type CommentItem = { id: string; username: string; rank: string; text: string; timestamp: number; likes: number; likedByUser?: boolean; replies: ReplyItem[] };
function getComments(epId: string): CommentItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(`anisub_cmt_${epId}`) ?? "null");
    if (Array.isArray(stored)) return stored;
    return [];
  } catch { return []; }
}
function saveComments(epId: string, list: CommentItem[]) {
  try { localStorage.setItem(`anisub_cmt_${epId}`, JSON.stringify(list.slice(0, 200))); } catch {}
}
type LikeState = { liked: boolean; disliked: boolean; likes: number; dislikes: number };
function stableHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}
function getLikes(animeId: string): LikeState {
  try {
    const s = JSON.parse(localStorage.getItem(`anisub_like2_${animeId}`) ?? "null");
    if (s) return s;
    const h = stableHash(animeId);
    const likes = 10000 + (h % 60001);        // 10000–70000
    const dislikes = 1 + ((h >> 8) % 999);    // 1–999
    return { liked: false, disliked: false, likes, dislikes };
  } catch { return { liked: false, disliked: false, likes: 15420, dislikes: 87 }; }
}
function saveLikes(animeId: string, s: LikeState) { try { localStorage.setItem(`anisub_like2_${animeId}`, JSON.stringify(s)); } catch {} }

// ── Skip OP overlay ───────────────────────────────────────────────────────────
function SkipOpOverlay({ onSkip, onDismiss, countdown }: { onSkip: () => void; onDismiss: () => void; countdown?: number | null }) {
  return (
    <div style={{ position: "absolute", bottom: 64, right: 12, zIndex: 35, animation: "slide-up-fade 0.3s ease both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={e => { e.stopPropagation(); e.preventDefault(); onDismiss(); }}
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 700, padding: "8px 14px", borderRadius: 999, cursor: "pointer" }}
        >Lewati</button>
        <button
          onClick={e => { e.stopPropagation(); e.preventDefault(); onSkip(); }}
          style={{ background: "linear-gradient(135deg,#FB923C,#F43F5E)", color: "#fff", fontSize: 12, fontWeight: 900, padding: "8px 16px", borderRadius: 999, boxShadow: "0 4px 18px rgba(251,146,60,0.6)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <SkipForward size={14}/> Skip OP{countdown != null ? ` ${countdown}` : ""}
        </button>
      </div>
    </div>
  );
}

// ── Episode List Panel ────────────────────────────────────────────────────────
function EpisodeListPanel({ episodes, currentEpId, onSelect, onClose, epMeta }: {
  episodes: EpisodeListItem[]; currentEpId: string;
  onSelect: (epId: string) => void; onClose: () => void;
  epMeta?: ReturnType<typeof buildEpisodeMeta>;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: "rgba(10,10,22,0.85)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <List size={16} color="#94A3B8"/>
        <span style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Pilih Episode</span>
        <button onClick={onClose} className="ml-auto" style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X size={14} color="#fff"/>
        </button>
      </div>
      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "8px 0" }}>
        {[...episodes].reverse().map(ep => {
          const isCurrent = ep.episodeId === currentEpId;
          const epNum = parseInt(ep.title);
          const isLast = !isNaN(epNum) && epMeta?.isFinished && epNum === Math.max(...episodes.map(e => parseInt(e.title) || 0));
          const viewers = epMeta && !isNaN(epNum) ? epMeta.getViewers(ep.episodeId, epNum) : null;
          const airAt = epMeta && !isNaN(epNum) ? epMeta.airDateMap.get(epNum) : undefined;
          return (
            <button key={ep.episodeId} onClick={() => onSelect(ep.episodeId)}
              className="w-full flex items-center gap-4 px-4 py-3.5 text-left"
              style={{ background: isCurrent ? "rgba(251,146,60,0.12)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ width: 28, textAlign: "center", fontWeight: 900, fontSize: 15, color: isCurrent ? "#FB923C" : "#64748B", flexShrink: 0 }}>{ep.title}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: isCurrent ? "#FB923C" : "#CBD5E1" }}>
                  Episode {ep.title}{isLast ? " (End)" : ""}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                  {viewers !== null && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#38BDF8" }}>👁 {formatViewers(viewers)}</span>
                  )}
                  {airAt && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#A78BFA" }}>🗓 {fmtEpDate(airAt)}</span>
                  )}
                </div>
              </div>
              <ChevronRight size={16} color={isCurrent ? "#FB923C" : "#475569"}/>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Server Sheet ──────────────────────────────────────────────────────────────
function ServerSheet({ servers, currentId, onSelect, onClose }: {
  servers: { serverId: string; title: string; quality: string }[];
  currentId: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  const grouped = servers.reduce<Record<string, typeof servers>>((acc, s) => {
    if (!acc[s.quality]) acc[s.quality] = [];
    acc[s.quality].push(s);
    return acc;
  }, {});
  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d1f", borderRadius: "20px 20px 0 0", padding: "16px 0 32px", maxHeight: "75vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between px-5 mb-4">
          <span style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>Pilih Server</span>
          <button onClick={onClose}><X size={18} color="#64748B"/></button>
        </div>
        {Object.entries(grouped).map(([quality, srvs]) => (
          <div key={quality}>
            <div className="px-5 py-2" style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.08em" }}>{quality}</div>
            {srvs.map((s, i) => (
              <button key={s.serverId} onClick={() => onSelect(s.serverId)}
                className="w-full flex items-center gap-3 px-5 py-3.5"
                style={{ background: s.serverId === currentId ? "rgba(251,146,60,0.1)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ width: 28, height: 28, borderRadius: "50%", background: s.serverId === currentId ? "rgba(251,146,60,0.2)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: s.serverId === currentId ? "#FB923C" : "#94A3B8", flexShrink: 0 }}>S{i + 1}</span>
                <span style={{ flex: 1, textAlign: "left", fontSize: 14, fontWeight: 700, color: s.serverId === currentId ? "#FB923C" : "#CBD5E1" }}>{s.title}</span>
                {s.serverId === currentId && <span style={{ fontSize: 11, color: "#FB923C", fontWeight: 800 }}>✓ Aktif</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Speed Sheet ───────────────────────────────────────────────────────────────
const SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
function SpeedSheet({ speed, onSelect, onClose }: { speed: number; onSelect: (s: number) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d1f", borderRadius: "20px 20px 0 0", padding: "16px 0 32px" }}>
        <div className="flex items-center justify-between px-5 mb-3">
          <span style={{ fontWeight: 800, fontSize: 15, color: "#fff" }}>Kecepatan Putar</span>
          <button onClick={onClose}><X size={18} color="#64748B"/></button>
        </div>
        <div className="flex flex-wrap gap-3 px-5 pt-2">
          {SPEEDS.map(s => (
            <button key={s} onClick={() => onSelect(s)}
              style={{ flex: "1 1 28%", padding: "12px 0", borderRadius: 14, textAlign: "center", fontWeight: 800, fontSize: 14, background: speed === s ? "rgba(251,146,60,0.2)" : "rgba(255,255,255,0.05)", color: speed === s ? "#FB923C" : "#94A3B8", border: speed === s ? "1px solid rgba(251,146,60,0.5)" : "1px solid rgba(255,255,255,0.06)" }}>
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Player Core ───────────────────────────────────────────────────────────────
interface PlayerCoreProps {
  url: string; episodeId: string; title: string; episodeLabel: string;
  isLandscape: boolean; onToggleLandscape: () => void;
  hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void;
  autoSkipOp: boolean; onSkipOpDone: (s: number) => void;
  skipStart?: number; skipEnd?: number;
  hdQuality?: string;
  playbackSpeed: number; onSpeedClick: () => void;
  brightness: number; onBrightnessChange: (v: number) => void;
  volume: number; onVolumeChange: (v: number) => void;
  showEpList: boolean; onToggleEpList: () => void;
  onQualityClick?: () => void;
  elapsedSec: number; durationSec: number; onSeek?: (ratio: number) => void;
  autoNextEp: boolean;
  onTimeUpdate?: (elapsed: number, duration: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
}

function PlayerCore({
  url, episodeId, title, episodeLabel,
  isLandscape, onToggleLandscape,
  hasPrev, hasNext, onPrev, onNext,
  autoSkipOp, onSkipOpDone,
  skipStart, skipEnd,
  hdQuality,
  playbackSpeed, onSpeedClick,
  brightness, onBrightnessChange,
  volume, onVolumeChange,
  showEpList, onToggleEpList,
  onQualityClick,
  elapsedSec, durationSec, onSeek,
  autoNextEp,
  onTimeUpdate,
  onPlayStateChange,
}: PlayerCoreProps) {
  const effectiveSkipStart = skipStart ?? 0;
  const effectiveSkipEnd = skipEnd ?? SKIP_OP_SECONDS;
  const isProxyStream = url.includes("/api/proxy/stream?");
  const isDirectVideo = isProxyStream || url.endsWith(".mp4") || url.endsWith(".m3u8") || url.endsWith(".webm")
    || url.includes(".mp4?") || url.includes(".m3u8?") || url.startsWith("blob:");
  // Only treat as HLS if URL actually contains m3u8 — proxy streams for mp4
  // (e.g. googlevideo) must NOT use Hls.js; they play directly via <video src>.
  const isHls = url.includes(".m3u8") || (isProxyStream && url.includes("m3u8"));
  // Detect AniSub WebView APK — user agent contains "AniSubApp" marker set by the APK builder.
  // In WebView, system nav bars can overlap the player if env(safe-area-inset-*) isn't reported
  // correctly, so we add more generous fallback padding.
  const isWebView = typeof navigator !== "undefined" && /AniSubApp/i.test(navigator.userAgent);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [showSkipBtn, setShowSkipBtn] = useState(false);
  const [skipOpUsed, setSkipOpUsed] = useState(false);
  const [hlsLevel, setHlsLevel] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  // Ref synced synchronously with every setShowControls() call so tap handlers
  // always read the current value — avoids the async-state race on mobile.
  const showControlsRef = useRef(true);
  const brightBtnDragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const [videoZoom, setVideoZoom] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeIsPlaying, setIframeIsPlaying] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeVideoRef = useRef<HTMLVideoElement | null>(null);
  const [iframeRealTime, setIframeRealTime] = useState<{ cur: number; dur: number } | null>(null);
  const containerDivRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(true);
  const autoSkippedRef = useRef(false);
  const skipShownRef = useRef(false);
  const iframeDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSkipOpRef = useRef(autoSkipOp);
  autoSkipOpRef.current = autoSkipOp;
  const [skipCountdown, setSkipCountdown] = useState<number | null>(null);
  const skipCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [ping, setPing] = useState<number | null>(null);

  // ── Gesture & double-tap state ────────────────────────────────────────────
  const [gestureActive, setGestureActive] = useState<null | "brightness" | "volume">(null);
  const [gestureValue, setGestureValue] = useState(0);
  const [seekFeedback, setSeekFeedback] = useState<null | "left" | "right">(null);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartValRef = useRef(0); // brightness or volume start value
  const gestureTypeRef = useRef<null | "brightness" | "volume" | "tap" | "none">(null);
  const lastTapTimeRef = useRef(0);
  const seekFbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks when the last onTouchEnd fired so handleTap (onClick) can ignore
  // the synthetic click that mobile browsers generate after every touch event.
  // Without this, one tap fires toggleControls() TWICE (touch + click) = no change.
  const lastTouchEndMsRef = useRef(0);
  // Delays single-tap toggleControls() so it can be cancelled if a double-tap arrives.
  // Without this, the first tap of a double-tap flickers the controls before seek fires.
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show controls. When PLAYING → auto-hide after durationMs (default 5s).
  // When PAUSED → controls stay visible indefinitely; user hides with tap.
  const showControlsTemporarily = useCallback((durationMs = 5000) => {
    showControlsRef.current = true;
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (!isPlayingRef.current) {
      // Paused: no auto-hide — controls stay until user taps to dismiss.
      controlsTimerRef.current = null;
      return;
    }
    controlsTimerRef.current = setTimeout(() => {
      showControlsRef.current = false;
      setShowControls(false);
    }, durationMs);
  }, []);

  // Hide controls immediately, cancel any pending timer.
  const hideControlsNow = useCallback(() => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = null;
    showControlsRef.current = false;
    setShowControls(false);
  }, []);

  // Toggle: controls visible → hide instantly; controls hidden → show (5s timer if playing, permanent if paused).
  // This is what a tap on the empty video area triggers.
  const toggleControls = useCallback(() => {
    if (showControlsRef.current) {
      hideControlsNow();
    } else {
      showControlsTemporarily();
    }
  }, [hideControlsNow, showControlsTemporarily]);

  // Keep alias for backward compat inside this closure
  const resetControlsTimer = showControlsTemporarily;

  useEffect(() => {
    showControlsTemporarily();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When entering/leaving landscape mode: show controls, always start auto-hide timer.
  useEffect(() => {
    showControlsTemporarily();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLandscape]);

  // ── Ping measurement — ukur latensi ke server tiap 8 detik ──────────────────
  useEffect(() => {
    const measure = async () => {
      try {
        const t = performance.now();
        await fetch("/api/health", { method: "HEAD", cache: "no-store" });
        setPing(Math.round(performance.now() - t));
      } catch { /* ignore */ }
    };
    measure();
    const id = setInterval(measure, 1500);
    return () => clearInterval(id);
  }, []);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handleFullscreen = async () => {
    if (isFullscreen) {
      await document.exitFullscreen().catch(() => {});
    } else {
      const el = containerDivRef.current;
      await el?.requestFullscreen().catch(() => {});
      try { await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.("landscape"); } catch {}
    }
  };

  // HLS
  useEffect(() => {
    if (!isHls || !videoRef.current) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (Hls.isSupported()) {
      const hls = new Hls({ autoStartLoad: true, startLevel: -1, capLevelToPlayerSize: false, maxBufferLength: 30, enableWorker: true });
      hls.loadSource(url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        const top = data.levels.length - 1;
        hls.currentLevel = top; hls.loadLevel = top;
        const lvl = data.levels[top];
        if (lvl) { const h = lvl.height ?? 0; setHlsLevel(h >= 1080 ? "1080p" : h >= 720 ? "720p" : h >= 480 ? "480p" : h > 0 ? `${h}p` : "HD"); }
        videoRef.current?.play().catch(() => {});
      });
      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.current.src = url; videoRef.current.play().catch(() => {});
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, isHls]);

  // ── Poll iframe video element untuk direct DOM control ──────────────────────
  // Proxy iframe adalah same-origin (sisko.replit.dev) → bisa akses contentDocument!
  useEffect(() => {
    if (isDirectVideo) return;
    iframeVideoRef.current = null;
    setIframeRealTime(null);
    let stopped = false;
    const poll = setInterval(() => {
      if (stopped) return;
      try {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return;
        // Cari video langsung, atau di nested iframe same-origin
        let v = doc.querySelector<HTMLVideoElement>('video');
        if (!v) {
          const frames = doc.querySelectorAll('iframe');
          for (const frame of Array.from(frames)) {
            try {
              const fv = frame.contentDocument?.querySelector<HTMLVideoElement>('video');
              if (fv) { v = fv; break; }
            } catch (_) {}
          }
        }
        if (!v) return;
        // Video element found — set up listeners
        iframeVideoRef.current = v;
        clearInterval(poll);
        v.addEventListener('timeupdate', () => {
          if (v.currentTime > 0) {
            setIframeRealTime({ cur: v.currentTime, dur: isFinite(v.duration) && v.duration > 0 ? v.duration : 0 });
            saveProgress(episodeId, v.currentTime, v.duration || 0);
          }
        });
        v.addEventListener('loadedmetadata', () => {
          if (isFinite(v.duration) && v.duration > 0)
            setIframeRealTime(p => ({ cur: p?.cur ?? 0, dur: v.duration }));
        });
        v.addEventListener('play', () => setIframeIsPlaying(true));
        v.addEventListener('pause', () => setIframeIsPlaying(false));
        v.addEventListener('ended', () => { if (autoNextEp && hasNext) onNext(); });
        // Restore saved progress
        const saved = getProgress(episodeId);
        if (saved && saved.position > 5) { setTimeout(() => { v.currentTime = saved.position; }, 300); }
      } catch (_) { clearInterval(poll); /* cross-origin — can't access */ }
    }, 600);
    return () => { stopped = true; clearInterval(poll); iframeVideoRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, isDirectVideo, episodeId]);

  // Playback speed — direct video & iframe via ANISUB_CMD
  useEffect(() => {
    if (isDirectVideo) {
      if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
    } else {
      iframeRef.current?.contentWindow?.postMessage({ type: 'ANISUB_CMD', cmd: 'speed', rate: playbackSpeed }, '*');
    }
  }, [playbackSpeed, isDirectVideo]);

  // ── ANISUB_TIME / ANISUB_STATE listener (dari proxy inject script) ──────────
  useEffect(() => {
    if (isDirectVideo) return;
    const handler = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === 'ANISUB_TIME') {
        const { cur, dur } = e.data as { cur: number; dur: number };
        if (typeof cur === 'number' && cur > 0) {
          setIframeRealTime({ cur, dur: dur || 0 });
          saveProgress(episodeId, cur, dur || 0);
        }
      } else if (e.data.type === 'ANISUB_STATE') {
        const playing = !!(e.data as { playing: boolean }).playing;
        setIframeIsPlaying(playing);
        isPlayingRef.current = playing;
        onPlayStateChange?.(playing);
        showControlsTemporarily();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isDirectVideo, episodeId]);

  // Brightness filter on video
  const brightnessFilter = `brightness(${brightness / 100})`;

  // Skip OP for iframe — tampilkan tombol saja, biarkan countdown handle auto-skip
  useEffect(() => {
    setShowSkipBtn(false); setSkipOpUsed(false); autoSkippedRef.current = false; skipShownRef.current = false;
    if (iframeDelayRef.current) clearTimeout(iframeDelayRef.current);
    if (!isDirectVideo && effectiveSkipEnd > effectiveSkipStart) {
      // Jika ada data AniSkip (skipStart > 0), tunggu sampai detik skipStart
      // Jika tidak ada (skipStart = 0), tampilkan setelah 5 detik
      const delayMs = effectiveSkipStart > 0 ? effectiveSkipStart * 1000 : 5000;
      iframeDelayRef.current = setTimeout(() => {
        if (autoSkippedRef.current) return;
        setShowSkipBtn(true); // countdown useEffect akan handle auto-skip jika diaktifkan
      }, delayMs);
    }
    return () => { if (iframeDelayRef.current) clearTimeout(iframeDelayRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, effectiveSkipStart, effectiveSkipEnd, isDirectVideo]);

  // Countdown auto-skip: saat Skip OP muncul dan autoSkipOp ON, hitung mundur 5s lalu skip
  useEffect(() => {
    if (skipCountdownRef.current) { clearInterval(skipCountdownRef.current); skipCountdownRef.current = null; }
    setSkipCountdown(null);
    if (!showSkipBtn || autoSkippedRef.current) return;
    if (!autoSkipOp) return;
    let count = 5;
    setSkipCountdown(count);
    skipCountdownRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(skipCountdownRef.current!); skipCountdownRef.current = null;
        setSkipCountdown(null);
        if (!autoSkippedRef.current) { autoSkippedRef.current = true; doSkip(); }
      } else {
        setSkipCountdown(count);
      }
    }, 1000);
    return () => { if (skipCountdownRef.current) { clearInterval(skipCountdownRef.current); skipCountdownRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSkipBtn, autoSkipOp]);

  const doSkip = () => {
    if (isDirectVideo && videoRef.current) {
      videoRef.current.currentTime = effectiveSkipEnd;
    } else if (iframeVideoRef.current) {
      iframeVideoRef.current.currentTime = effectiveSkipEnd;
      setIframeRealTime(p => p ? { ...p, cur: effectiveSkipEnd } : null);
    } else {
      // Fallback: kirim perintah seek via ANISUB_CMD ke proxy inject script
      iframeRef.current?.contentWindow?.postMessage({ type: 'ANISUB_CMD', cmd: 'seek', time: effectiveSkipEnd }, '*');
      setIframeRealTime(p => ({ cur: effectiveSkipEnd, dur: p?.dur || 0 }));
    }
    onSkipOpDone(effectiveSkipEnd); setShowSkipBtn(false);
  };

  // Skip +90 detik dari posisi saat ini (bukan ke fixed timestamp)
  const doManualSkip = () => {
    const newTime = Math.min(elapsedSec + 90, durationSec > 0 ? durationSec : elapsedSec + 90);
    if (isDirectVideo && videoRef.current) {
      videoRef.current.currentTime = newTime;
    } else if (iframeVideoRef.current) {
      iframeVideoRef.current.currentTime = newTime;
      setIframeRealTime(p => p ? { ...p, cur: newTime } : null);
    } else {
      iframeRef.current?.contentWindow?.postMessage({ type: 'ANISUB_CMD', cmd: 'seek', time: newTime }, '*');
      setIframeRealTime(p => ({ cur: newTime, dur: p?.dur || 0 }));
    }
    onSkipOpDone(newTime);
    setShowSkipBtn(false);
    setSkipOpUsed(true);
    showControlsTemporarily();
  };

  const handlePlayPause = () => {
    if (isDirectVideo) {
      if (videoRef.current) {
        if (videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
          isPlayingRef.current = true;
          setIsPlaying(true);
          showControlsTemporarily();
        } else {
          videoRef.current.pause();
          isPlayingRef.current = false;
          setIsPlaying(false);
          showControlsTemporarily();
        }
      }
    } else {
      // Iframe mode: try direct DOM access (same-origin proxy iframe only)
      const v = iframeVideoRef.current;
      if (v) {
        if (v.paused) { v.play().catch(() => {}); setIsPlaying(true); isPlayingRef.current = true; onPlayStateChange?.(true); showControlsTemporarily(); }
        else { v.pause(); setIsPlaying(false); isPlayingRef.current = false; onPlayStateChange?.(false); showControlsTemporarily(); }
      } else {
        // Cross-origin iframe: toggle via postMessage (may not work for all sites)
        const win = iframeRef.current?.contentWindow;
        if (win) { win.postMessage({ type: 'ANISUB_CMD', cmd: 'toggle' }, '*'); }
        const nowPlaying = !isPlayingRef.current;
        setIsPlaying(nowPlaying); isPlayingRef.current = nowPlaying;
        onPlayStateChange?.(nowPlaying);
        showControlsTemporarily();
      }
    }
  };

  const handleTap = () => {
    if (isLocked) return;
    // On mobile, browser fires a synthetic onClick ~300ms after every touch.
    // onGestureTouchEnd already handled the tap — skip to avoid double-toggle.
    if (Date.now() - lastTouchEndMsRef.current < 500) return;
    toggleControls();
  };

  // ── Unified touch handlers (gesture + double-tap) ─────────────────────────
  const onGestureTouchStart = (e: React.TouchEvent) => {
    if (isLocked || e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
    gestureTypeRef.current = null;
    const container = containerDivRef.current;
    const isLeft = container ? t.clientX < container.clientWidth / 2 : false;
    touchStartValRef.current = isLeft ? brightness : 0;
  };

  const onGestureTouchMove = (e: React.TouchEvent) => {
    if (isLocked || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartXRef.current;
    const dy = t.clientY - touchStartYRef.current;
    if (gestureTypeRef.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.2 && Math.abs(dy) > 12) {
        const container = containerDivRef.current;
        const isLeft = container ? touchStartXRef.current < container.clientWidth / 2 : false;
        gestureTypeRef.current = isLeft ? "brightness" : "none";
      } else {
        gestureTypeRef.current = "none";
      }
    }
    if (gestureTypeRef.current === "brightness") {
      const newVal = Math.max(20, Math.min(150, touchStartValRef.current - dy * 0.5));
      onBrightnessChange(Math.round(newVal));
      setGestureActive("brightness");
      setGestureValue(Math.round(newVal));
      e.preventDefault();
    }
  };

  const onGestureTouchEnd = (e: React.TouchEvent) => {
    if (isLocked) return;
    // If it was a real gesture, close indicator and stop
    if (gestureTypeRef.current === "brightness") {
      setTimeout(() => setGestureActive(null), 800);
      gestureTypeRef.current = null;
      return;
    }
    gestureTypeRef.current = null;
    // Check if it was a tap (didn't move much)
    const ct = e.changedTouches[0];
    if (!ct) return;
    const dx = Math.abs(ct.clientX - touchStartXRef.current);
    const dy = Math.abs(ct.clientY - touchStartYRef.current);
    if (dx > 20 || dy > 20) return; // was a swipe, not a tap
    const now = Date.now();
    const container = containerDivRef.current;
    // Double-tap to seek — portrait AND landscape, direct video only.
    // Cancel pending single-tap timer so controls don't flicker on first tap.
    if (isDirectVideo && now - lastTapTimeRef.current < 350) {
      if (singleTapTimerRef.current) { clearTimeout(singleTapTimerRef.current); singleTapTimerRef.current = null; }
      const isLeft = container ? ct.clientX < container.clientWidth / 2 : false;
      const seekSec = isLeft ? -10 : 10;
      // Seek directly on the video element — onSeek only updates parent UI state,
      // it does NOT set videoRef.current.currentTime, so the video would revert.
      if (videoRef.current && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
        videoRef.current.currentTime = Math.max(0, Math.min(
          videoRef.current.currentTime + seekSec,
          videoRef.current.duration
        ));
        // Sync parent elapsed display
        if (onSeek) onSeek(videoRef.current.currentTime / videoRef.current.duration);
      }
      const side = isLeft ? "left" : "right";
      setSeekFeedback(side);
      if (seekFbTimerRef.current) clearTimeout(seekFbTimerRef.current);
      seekFbTimerRef.current = setTimeout(() => setSeekFeedback(null), 700);
      lastTapTimeRef.current = 0;
      // Suppress the synthetic onClick that follows touch
      lastTouchEndMsRef.current = Date.now();
      // Show controls so user sees the seek arrow feedback
      showControlsTemporarily();
      return;
    }
    lastTapTimeRef.current = now;
    // Mark that touch handled this tap — handleTap (onClick) must ignore it
    lastTouchEndMsRef.current = Date.now();
    // Single tap: DELAY toggleControls() by 250ms so a second tap (double-tap)
    // can cancel it before it fires — prevents controls from flickering on double-tap.
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      toggleControls();
    }, 250);
  };

  const activeQuality = hlsLevel ?? hdQuality ?? null;
  const isHdMode = activeQuality && (activeQuality.includes("720") || activeQuality.includes("1080") || activeQuality.toUpperCase() === "HD");
  const displayQuality = activeQuality ?? "HD";

  const progress = durationSec > 0 ? Math.min(elapsedSec / durationSec, 1) : 0;

  const containerStyle: React.CSSProperties = isLandscape
    ? { position: "fixed", inset: 0, zIndex: 9999, background: "#000" }
    : { position: "relative", width: "100%", aspectRatio: "16/9", background: "#000" };

  const videoContent = isDirectVideo ? (
    <video
      ref={videoRef}
      src={isHls ? undefined : url}
      autoPlay playsInline
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        background: "#000",
        /* Zoom/full-width mode: like other anime apps, fill the screen
           completely edge-to-edge in every direction with nothing cut off
           top/bottom. "cover" would crop top/bottom whenever the screen is
           wider than the video (e.g. 16:9 video on a 19.5:9+ phone), which is
           exactly the bug reported. "fill" stretches to match the box exactly
           instead of cropping, so the full picture always stays visible. */
        objectFit: videoZoom ? "fill" : "contain",
      }}
      onPlay={() => { isPlayingRef.current = true; setIsPlaying(true); onPlayStateChange?.(true); showControlsTemporarily(); }}
      onPause={() => { isPlayingRef.current = false; setIsPlaying(false); onPlayStateChange?.(false); showControlsTemporarily(); }}
      onEnded={() => { if (autoNextEp && hasNext) onNext(); }}
      onTimeUpdate={e => {
        const v = e.currentTarget;
        if (v.currentTime > 0) {
          saveProgress(episodeId, v.currentTime, v.duration || 0);
          if (onTimeUpdate && isFinite(v.duration) && v.duration > 0) {
            onTimeUpdate(v.currentTime, v.duration);
          }
        }
        if (autoNextEp && v.duration > 0 && v.currentTime >= v.duration - 3 && hasNext) onNext();
        if (!skipShownRef.current && v.currentTime >= effectiveSkipStart && v.currentTime < effectiveSkipEnd) {
          skipShownRef.current = true;
          setShowSkipBtn(true); // countdown useEffect akan handle auto-skip jika autoSkipOp=true
        }
        if (v.currentTime >= effectiveSkipEnd + 2) setShowSkipBtn(false);
      }}
      onLoadedData={e => {
        const saved = getProgress(episodeId);
        if (saved && saved.position > 5) e.currentTarget.currentTime = saved.position;
      }}
    />
  ) : (
    /* Iframe mode: load embed URL directly (cross-origin).
       Overlay div blocks touches reaching streaming site controls — AniSub controls stay on top. */
    <>
      <iframe
        ref={iframeRef}
        key={url}
        src={url}
        allow="autoplay; fullscreen; encrypted-media"
        allowFullScreen
        title="video-player"
        style={{
          position: "absolute",
          /* Landscape+zoom: NEVER change iframe dimensions — streaming sites
             adapt their internal player to the iframe size, so making the iframe
             wider causes them to crop the video top/bottom too. Instead, use
             CSS transform scale so the site sees the original dimensions and
             renders the video normally; the parent overflow:hidden clips the edge.
             Portrait+zoom: shift left/top so the site's own chrome is clipped. */
          top: (videoZoom && !isLandscape) ? "-16.5%" : 0,
          left: (videoZoom && !isLandscape) ? "-16.5%" : 0,
          right: 0, bottom: 0,
          width: (videoZoom && !isLandscape) ? "133%" : "100%",
          /* Portrait: always extend 15% below to clip streaming-site controls.
             Landscape: always 100% — zoom uses transform, not dimension change. */
          height: isLandscape ? "100%" : "115%",
          /* Landscape+zoom: slight visual zoom via transform (streaming site unaware).
             Top/bottom crop is only ~4% each side vs 16.5% with dimension approach. */
          transform: (videoZoom && isLandscape) ? "scale(1.08)" : "none",
          transformOrigin: "center center",
          border: "none", background: "#000",
          filter: undefined,
        }}
      />
      {/* Touch blocker: sits above iframe (z-index 4) but below AniSub controls (z-index 20).
          Prevents touches reaching streaming site player controls. Events bubble to container. */}
      <div
        style={{
          position: "absolute", inset: 0, zIndex: 4,
          background: "transparent",
        }}
      />
    </>
  );

  // ── DIRECT VIDEO mode: full custom player controls ────────────────────────
  return (
    <div ref={containerDivRef} style={{ ...containerStyle, touchAction: "none", overflow: "hidden" }}
      onClick={handleTap}
      onTouchStart={onGestureTouchStart}
      onTouchMove={onGestureTouchMove}
      onTouchEnd={onGestureTouchEnd}
    >
      {videoContent}

      {/* ── Gesture feedback (direct video) ── */}
      {gestureActive === "brightness" && (
        <div style={{
          position: "absolute", top: "50%", left: "12%",
          transform: "translateY(-50%)", zIndex: 30,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(16px)",
          borderRadius: 16, padding: "14px 12px", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 8, minWidth: 52,
        }}>
          <span style={{ fontSize: 22 }}>☀️</span>
          <div style={{ height: 80, width: 4, borderRadius: 99, background: "rgba(255,255,255,0.15)", position: "relative" }}>
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, borderRadius: 99,
              background: "#FBBF24",
              height: `${Math.min(100, (gestureValue - 20) / 1.3)}%`,
            }}/>
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>{gestureValue}%</span>
        </div>
      )}

      {/* ── Seek feedback (double-tap, direct video) ── */}
      {seekFeedback && (
        <div style={{
          position: "absolute", top: "50%", transform: "translateY(-50%)",
          left: seekFeedback === "left" ? "8%" : "auto", right: seekFeedback === "right" ? "8%" : "auto",
          zIndex: 30, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
          borderRadius: 50, padding: "14px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        }}>
          <span style={{ fontSize: 22, color: "#fff" }}>{seekFeedback === "left" ? "◀◀" : "▶▶"}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#fff" }}>10 detik</span>
        </div>
      )}

      {/* ── Lock overlay ── */}
      {isLocked && (
        <div onClick={() => setIsLocked(false)} style={{ position: "absolute", inset: 0, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", cursor: "pointer" }}>
          <div style={{ padding: "10px 18px", borderRadius: 16, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <Lock size={22} color="#FB923C"/>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>Ketuk untuk buka kunci</span>
          </div>
        </div>
      )}

      {!isLocked && (
        <>
          {/* ── PERSISTENT SKIP OP: portrait only (time-gated). Landscape mode has it in bottom bar. ── */}
          {!isLandscape && elapsedSec >= 5 && elapsedSec < 300 && !skipOpUsed && (
            <div style={{ position: "absolute", bottom: 52, right: 12, zIndex: 28, pointerEvents: "auto" }}
              onClick={e => e.stopPropagation()}>
              <button
                onPointerUp={e => { e.stopPropagation(); if (skipCountdownRef.current) { clearInterval(skipCountdownRef.current); skipCountdownRef.current = null; } setSkipCountdown(null); doManualSkip(); }}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, background: showSkipBtn ? "rgba(251,146,60,0.92)" : "rgba(0,0,0,0.62)", backdropFilter: "blur(10px)", border: showSkipBtn ? "1.5px solid rgba(251,146,60,0.7)" : "1.5px solid rgba(255,255,255,0.18)", color: "#fff", fontSize: 12, fontWeight: 800, boxShadow: showSkipBtn ? "0 0 12px rgba(251,146,60,0.55)" : "none", transition: "background 0.3s, box-shadow 0.3s", touchAction: "manipulation" }}>
                <SkipForward size={12}/> Skip OP{skipCountdown != null ? ` (${skipCountdown})` : ""}
              </button>
            </div>
          )}

          {/* ── TOP BAR ── */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.80) 0%, transparent 100%)",
            display: "flex", alignItems: "center", gap: 8,
            ...(isLandscape
              ? { paddingTop: 10, paddingBottom: 24, paddingLeft: (isWebView ? "max(env(safe-area-inset-left, 0px), 20px)" : "max(env(safe-area-inset-left, 0px), 14px)") as unknown as number, paddingRight: (isWebView ? "max(env(safe-area-inset-right, 0px), 20px)" : "max(env(safe-area-inset-right, 0px), 14px)") as unknown as number }
              : { padding: "10px 12px 20px" }),
            opacity: showControls ? 1 : 0, transition: "opacity 0.25s ease",
            pointerEvents: "auto",
          }}>
            {/* ▶ Title */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Play size={9} color="#fff" fill="#fff"/>
              </div>
              <span style={{ fontSize: isLandscape ? 13 : 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{episodeLabel}</span>
            </div>

            {/* HD quality badge — tappable to open server/quality sheet */}
            <button
              onPointerUp={e => { e.stopPropagation(); onQualityClick?.(); resetControlsTimer(); }}
              style={{ padding: "4px 9px", borderRadius: 5, background: isHdMode ? "rgba(251,191,36,0.22)" : "rgba(255,255,255,0.15)", border: isHdMode ? "1px solid rgba(251,191,36,0.6)" : "1px solid rgba(255,255,255,0.3)", flexShrink: 0, touchAction: "manipulation" }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: isHdMode ? "#FBBF24" : "#fff", letterSpacing: "0.05em" }}>{displayQuality}</span>
            </button>

            {/* Ping / sinyal badge */}
            {ping !== null && (() => {
              const good = ping < 150;
              const med  = ping < 321;
              const clr  = good ? "#22C55E" : med ? "#FBBF24" : "#EF4444";
              const bg   = good ? "rgba(34,197,94,0.15)"  : med ? "rgba(251,191,36,0.15)"  : "rgba(239,68,68,0.15)";
              const bdr  = good ? "rgba(34,197,94,0.55)"  : med ? "rgba(251,191,36,0.55)"  : "rgba(239,68,68,0.55)";
              const lbl  = good ? "LANCAR CUYY🤪"          : med ? "AGAK LEMOT😇"           : "NGELAG BANGET😤😡";
              return (
                <div style={{ padding: "4px 8px", borderRadius: 5, background: bg, border: `1px solid ${bdr}`, flexShrink: 0, pointerEvents: "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: clr, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>{ping}ms {lbl}</span>
                </div>
              );
            })()}

            {/* ≡ Episode list */}
            <button
              onPointerUp={e => { e.stopPropagation(); onToggleEpList(); resetControlsTimer(); }}
              onClick={e => { e.stopPropagation(); e.preventDefault(); }}
              style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, touchAction: "manipulation" }}>
              <List size={15} color="#fff"/>
            </button>

            {/* ⊞ exit landscape (landscape) | lock (portrait) */}
            {isLandscape ? (
              <button
                onPointerUp={e => { e.stopPropagation(); onToggleLandscape?.(); }}
                onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, touchAction: "manipulation" }}>
                <Minimize2 size={14} color="#fff"/>
              </button>
            ) : (
              <>
                {/* ⤢ enter landscape (portrait only) */}
                <button
                  onPointerUp={e => { e.stopPropagation(); onToggleLandscape?.(); }}
                  onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                  style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, touchAction: "manipulation" }}>
                  <Maximize2 size={14} color="#fff"/>
                </button>
                <button
                  onPointerUp={e => { e.stopPropagation(); setIsLocked(true); }}
                  onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                  style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, touchAction: "manipulation" }}>
                  <Unlock size={13} color="rgba(255,255,255,0.8)"/>
                </button>
              </>
            )}
          </div>

          {/* ── CENTER CONTROLS ── */}
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 20, display: "flex", alignItems: "center", gap: 20,
            opacity: showControls ? 1 : 0, transition: "opacity 0.25s ease",
            pointerEvents: showControls ? "auto" : "none",
          }}>
            <button
              onPointerUp={e => { e.stopPropagation(); if (hasPrev) onPrev(); }}
              style={{ width: 44, height: 44, borderRadius: "50%", background: hasPrev ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.2)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", opacity: hasPrev ? 1 : 0.35, touchAction: "manipulation" }}>
              <SkipBack size={20} color="#fff" fill={hasPrev ? "#fff" : "transparent"}/>
            </button>
            <button
              onPointerUp={e => { e.stopPropagation(); handlePlayPause(); }}
              style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "manipulation" }}>
              {isPlaying ? <Pause size={24} color="#fff" fill="#fff"/> : <Play size={24} color="#fff" fill="#fff"/>}
            </button>
            <button
              onPointerUp={e => { e.stopPropagation(); if (hasNext) onNext(); }}
              style={{ width: 44, height: 44, borderRadius: "50%", background: hasNext ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.2)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", opacity: hasNext ? 1 : 0.35, touchAction: "manipulation" }}>
              <SkipForward size={20} color="#fff" fill={hasNext ? "#fff" : "transparent"}/>
            </button>
          </div>

          {/* ── BOTTOM BAR ── */}
          {/* Iframe mode: aggressive gradient (120px tall) to fully cover streaming site's seekbar/controls */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
            background: !isDirectVideo && !isLandscape
              ? "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.90) 35%, rgba(0,0,0,0.70) 60%, rgba(0,0,0,0.30) 80%, transparent 100%)"
              : "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
            ...(isLandscape
              ? { paddingTop: 28, paddingBottom: (isWebView ? "max(env(safe-area-inset-bottom, 0px), 36px)" : "max(env(safe-area-inset-bottom, 0px), 24px)") as unknown as number, paddingLeft: (isWebView ? "max(env(safe-area-inset-left, 0px), 20px)" : "max(env(safe-area-inset-left, 0px), 14px)") as unknown as number, paddingRight: (isWebView ? "max(env(safe-area-inset-right, 0px), 20px)" : "max(env(safe-area-inset-right, 0px), 14px)") as unknown as number }
              : { padding: !isDirectVideo ? "120px 12px 8px" : "16px 12px 8px" }),
            opacity: showControls ? 1 : 0, transition: "opacity 0.25s ease",
            pointerEvents: "auto",
          }}>
            {/* Pills row: Speed + Skip OP (landscape always-visible) */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              {/* ↻ Speed */}
              <button
                onClick={e => { e.stopPropagation(); onSpeedClick(); resetControlsTimer(); }}
                onPointerUp={e => e.stopPropagation()}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 12, fontWeight: 800, flexShrink: 0, touchAction: "manipulation" }}>
                <span style={{ fontSize: 9, opacity: 0.7 }}>↻</span> {playbackSpeed}x
              </button>
              {/* ↪ Skip OP +90s — always visible in landscape */}
              {isLandscape && (
                <button
                  onClick={e => e.stopPropagation()}
                  onPointerUp={e => { e.stopPropagation(); if (skipCountdownRef.current) { clearInterval(skipCountdownRef.current); skipCountdownRef.current = null; } setSkipCountdown(null); doManualSkip(); resetControlsTimer(); }}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, background: "rgba(251,146,60,0.18)", border: "1.5px solid rgba(251,146,60,0.5)", color: "#FB923C", fontSize: 12, fontWeight: 800, flexShrink: 0, touchAction: "manipulation" }}>
                  <SkipForward size={11} color="#FB923C"/> Skip OP
                </button>
              )}
            </div>

            {/* Seekbar row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", minWidth: 40, textAlign: "center" }}>{formatTime(elapsedSec)}</span>
              {/* Seekbar track — tall hit area for easy touch/drag, pointer capture for smooth scrub */}
              <div
                style={{ flex: 1, height: 24, display: "flex", alignItems: "center", position: "relative", cursor: "pointer", touchAction: "none" }}
                onPointerDown={e => {
                  e.stopPropagation();
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  if (isDirectVideo && videoRef.current && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
                    videoRef.current.currentTime = ratio * videoRef.current.duration;
                  } else if (iframeVideoRef.current && isFinite(iframeVideoRef.current.duration) && iframeVideoRef.current.duration > 0) {
                    iframeVideoRef.current.currentTime = ratio * iframeVideoRef.current.duration;
                  } else if (!isDirectVideo) {
                    iframeRef.current?.contentWindow?.postMessage({ type: 'ANISUB_CMD', cmd: 'seekRatio', ratio }, '*');
                  }
                  if (onSeek) onSeek(ratio);
                }}
                onPointerMove={e => {
                  if ((e.buttons & 1) === 0) return;
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  if (isDirectVideo && videoRef.current && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
                    videoRef.current.currentTime = ratio * videoRef.current.duration;
                  } else if (iframeVideoRef.current && isFinite(iframeVideoRef.current.duration) && iframeVideoRef.current.duration > 0) {
                    iframeVideoRef.current.currentTime = ratio * iframeVideoRef.current.duration;
                  }
                  if (onSeek) onSeek(ratio);
                }}
                onPointerUp={e => { e.stopPropagation(); }}
              >
                <div style={{ position: "absolute", left: 0, right: 0, height: 3, borderRadius: 999, background: "rgba(255,255,255,0.2)" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999, background: "linear-gradient(90deg,#FB923C,#F43F5E)", width: `${progress * 100}%` }}/>
                  <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: `${progress * 100}%`, marginLeft: -5, width: 10, height: 10, borderRadius: "50%", background: "#fff", boxShadow: "0 0 6px rgba(251,146,60,0.8)" }}/>
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", minWidth: 40, textAlign: "center" }}>{formatTime(durationSec)}</span>

              {/* Landscape-only: Brightness + Video Zoom */}
              {isLandscape && (
                <>
                  {/* ☀ Brightness button — tap & drag up/down to adjust directly (no popup) */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={e => e.stopPropagation()}
                      onPointerDown={e => {
                        e.stopPropagation();
                        (e.currentTarget as Element).setPointerCapture(e.pointerId);
                        brightBtnDragRef.current = { startY: e.clientY, startVal: brightness };
                        setGestureActive("brightness");
                        setGestureValue(brightness);
                      }}
                      onPointerMove={e => {
                        if (!brightBtnDragRef.current) return;
                        e.stopPropagation();
                        const { startY, startVal } = brightBtnDragRef.current;
                        const dy = startY - e.clientY;
                        const newVal = Math.max(20, Math.min(150, Math.round(startVal + dy * 0.6)));
                        onBrightnessChange(newVal);
                        setGestureValue(newVal);
                      }}
                      onPointerUp={e => {
                        e.stopPropagation();
                        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
                        brightBtnDragRef.current = null;
                        setTimeout(() => setGestureActive(null), 500);
                      }}
                      style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: gestureActive === "brightness" ? "rgba(251,191,36,0.22)" : "rgba(255,255,255,0.1)", border: gestureActive === "brightness" ? "1px solid rgba(251,191,36,0.55)" : "1px solid transparent", touchAction: "none" }}>
                      <Sun size={15} color="#FBBF24"/>
                    </button>
                  </div>

                  {/* 🖥/⤢ Screen mode toggle: normal fit ↔ full-screen fill (fills edge-to-edge, nothing cropped top/bottom) */}
                  <button
                    onClick={e => e.stopPropagation()}
                    onPointerUp={e => { e.stopPropagation(); setVideoZoom(z => !z); }}
                    style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: videoZoom ? "rgba(96,165,250,0.22)" : "rgba(255,255,255,0.1)", border: videoZoom ? "1px solid rgba(96,165,250,0.55)" : "1px solid transparent", flexShrink: 0, touchAction: "manipulation" }}>
                    {videoZoom ? <Maximize2 size={14} color="#60A5FA"/> : <Monitor size={14} color="rgba(255,255,255,0.85)"/>}
                  </button>
                </>
              )}
            </div>
          </div>

        </>
      )}
    </div>
  );
}

// ── Main Watch component ──────────────────────────────────────────────────────
export default function Watch() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [, setLocation] = useLocation();
  const [activeServerId, setActiveServerId] = useState<string>("default");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [extractedUrl, setExtractedUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractFailed, setExtractFailed] = useState(false);
  const [loadingServer, setLoadingServer] = useState(false);
  const [qualityFilter, setQualityFilter] = useState<string | null>(null);
  const [isLandscape, setIsLandscape] = useState(false);
  const [skipToast, setSkipToast] = useState<string | null>(null);
  const [skipInterval, setSkipInterval] = useState<{ startTime: number; endTime: number } | null>(null);
  const [autoSkipOp, setAutoSkipOp] = useState(() => localStorage.getItem("anisub_autoskip_op") === "true");
  const [autoNextEp, setAutoNextEp] = useState(() => localStorage.getItem("anisub_autonext") !== "false");
  const autoLoadedRef = useRef(false);
  const iframeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iframeStartRef = useRef<number>(0);
  const iframeSavedPosRef = useRef<number>(0);
  const iframePlayingRef = useRef<boolean>(true);
  const videoUrlRef = useRef<string | null>(null);
  const extractingRef = useRef(false);
  // Full sorted server queue — dipakai untuk auto-advance ketika proxy tidak bisa reach server
  const allServersRef = useRef<{ serverId: string; title: string; quality: string }[]>([]);
  const activeServerIdRef = useRef<string>("default"); // always synced to activeServerId state
  const [proxyNetworkFailed, setProxyNetworkFailed] = useState(false);
  const [serverExhausted, setServerExhausted] = useState(false);

  // New state
  const [showEpList, setShowEpList] = useState(false);
  const [showServerSheet, setShowServerSheet] = useState(false);
  const [showSpeedSheet, setShowSpeedSheet] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [brightness, setBrightness] = useState(100);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [commentInput, setCommentInput] = useState("");
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [likeState, setLikeState] = useState<LikeState>({ liked: false, disliked: false, likes: 120, dislikes: 1 });
  const [volume, setVolume] = useState(100);

  const queryClient = useQueryClient();

  const { data: episode, isLoading } = useQuery({
    queryKey: ["episode", episodeId],
    queryFn: () => fetchEpisode(episodeId!),
    enabled: !!episodeId,
    staleTime: 5 * 60_000,
  });

  // Fetch anime episode list for the panel
  const { data: animeDetail } = useQuery({
    queryKey: ["animeDetail", episode?.animeId],
    queryFn: () => fetchAnimeDetail(episode!.animeId),
    enabled: !!episode?.animeId,
    staleTime: 10 * 60_000,
  });

  // Data AniList (popularity, status, jadwal tayang) — dipakai buat viewer count & jam rilis
  const watchAnimeTitle = episode ? cleanTitle(episode.title).replace(/\s+Episode\s+\d+/i, "").trim() : "";
  const { data: watchRich } = useQuery({
    queryKey: ["anilistRich", watchAnimeTitle],
    queryFn: () => fetchAniListRichByTitle(watchAnimeTitle),
    enabled: !!watchAnimeTitle,
    staleTime: 6 * 3600_000,
  });

  // Init comments (per episode) + likes (per anime)
  useEffect(() => {
    if (!episodeId) return;
    setComments(getComments(episodeId));
  }, [episodeId]);

  useEffect(() => {
    const animeKey = episode?.animeId || episodeId;
    if (!animeKey) return;
    setLikeState(getLikes(animeKey));
  }, [episode?.animeId, episodeId]);

  // Reset on episode change
  useEffect(() => {
    autoLoadedRef.current = false;
    setVideoUrl(null);
    setExtractedUrl(null);
    setActiveServerId("default");
    setElapsedSec(0);
    setDurationSec(IFRAME_DEFAULT_DURATION);
    setServerExhausted(false);
    setProxyNetworkFailed(false);
    allServersRef.current = [];
  }, [episodeId]);

  // Compute whether videoUrl is already a direct playable URL.
  // Uses URL.pathname for extension checks to avoid false positives when embed URLs
  // contain .mp4/.m3u8 in query params (e.g. embed?file=video.mp4&id=123).
  const isAlreadyDirect = videoUrl ? (() => {
    if (videoUrl.includes("/api/proxy/stream?") || videoUrl.startsWith("blob:")) return true;
    try {
      const p = new URL(videoUrl).pathname;
      return p.endsWith(".mp4") || p.endsWith(".m3u8") || p.endsWith(".webm");
    } catch {
      return false; // unparseable URL → treat as embed, never as direct
    }
  })() : false;

  // Ekstrak URL video dari embed page lalu pipe lewat /api/proxy/stream (fix CORS)
  useEffect(() => {
    setExtractedUrl(null);
    setExtractFailed(false);
    if (!videoUrl) return;
    // Same pathname-based check as isAlreadyDirect — avoid false-positive on embed URLs
    if (videoUrl.includes("/api/proxy/stream?") || videoUrl.startsWith("blob:")) return;
    try { const p = new URL(videoUrl).pathname; if (p.endsWith(".mp4") || p.endsWith(".m3u8") || p.endsWith(".webm")) return; } catch { /* treat as embed */ }
    let cancelled = false;
    setExtracting(true);

    let originParam = "";
    try { originParam = encodeURIComponent(new URL(videoUrl).origin + "/"); } catch { /* skip origin */ }
    const toStreamProxy = (rawUrl: string) =>
      `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}${originParam ? `&origin=${originParam}` : ""}`;

    // OtakuDesu episode page as referer — desustream returns 403 without it
    const episodeReferer = `https://otakudesu.blog/episode/${episodeId}/`;

    fetch(
      `/api/proxy/extract?url=${encodeURIComponent(videoUrl)}&referer=${encodeURIComponent(episodeReferer)}`,
      { signal: AbortSignal.timeout(15000) }
    )
      .then(async r => {
        if (!r.ok) {
          // Bedakan: NETWORK_ERROR (DNS/host unreachable) → auto-advance server berikutnya
          //          error lain → iframe fallback (embed page bisa tetap tampil)
          let code = "UNKNOWN";
          try { const j = await r.json(); code = j.code ?? "UNKNOWN"; } catch {}
          if (!cancelled) {
            setExtracting(false);
            if (code === "NETWORK_ERROR") { setProxyNetworkFailed(true); }
            else { setExtractFailed(true); }
          }
          return;
        }
        const data: { videoUrl: string; proxied?: boolean } = await r.json();
        if (!cancelled && data.videoUrl) {
          // If already proxied by server (googlevideo IP-locked), use URL as-is.
          // Otherwise wrap in our stream proxy for CORS bypass.
          const finalUrl = data.proxied ? data.videoUrl : toStreamProxy(data.videoUrl);
          setExtractedUrl(finalUrl);
          setExtracting(false);
        } else if (!cancelled) {
          setExtracting(false);
          setExtractFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) { setExtracting(false); setExtractFailed(true); }
      });

    const timeout = setTimeout(() => { if (!cancelled) { setExtracting(false); setExtractFailed(true); } }, 20000);
    return () => { cancelled = true; setExtracting(false); clearTimeout(timeout); };
  }, [videoUrl]);

  // Saat extraction gagal karena parse/upstream error → iframe fallback (host tetap reachable)
  useEffect(() => {
    if (!extractFailed) return;
    setExtractFailed(false);
    // iframe mode: proxy/embed masih bisa fetch halaman embed dari host
    // (host reachable, cuma URL video-nya tidak bisa di-extract dari HTML)
  }, [extractFailed]);

  // Saat proxy tidak bisa reach host (DNS/network error) → auto-advance ke server berikutnya.
  // Iframe fallback TIDAK dipakai karena /api/proxy/embed juga akan gagal (host yang sama).
  useEffect(() => {
    if (!proxyNetworkFailed) return;
    setProxyNetworkFailed(false);

    const queue = allServersRef.current;
    const curId = activeServerIdRef.current;
    const curIdx = queue.findIndex(s => s.serverId === curId);
    let nextIdx = curIdx + 1;

    const tryNext = async () => {
      while (nextIdx < queue.length) {
        const srv = queue[nextIdx];
        try {
          setLoadingServer(true);
          setVideoUrl(null);
          setExtractedUrl(null);
          setActiveServerId(srv.serverId);
          const data = await fetchServer(srv.serverId);
          const url = (data as { url?: string; frameOpen?: string }).url || (data as { url?: string; frameOpen?: string }).frameOpen || null;
          if (url) { setVideoUrl(url); setLoadingServer(false); return; }
        } catch { /* server tidak punya URL, coba selanjutnya */ }
        nextIdx++;
      }
      // Semua server sudah dicoba — tampilkan error UI
      setLoadingServer(false);
      setVideoUrl(null);
      setServerExhausted(true);
    };
    tryNext();
  }, [proxyNetworkFailed]);

  // Sync refs agar handler bisa akses nilai terkini tanpa re-register
  videoUrlRef.current = videoUrl;
  extractingRef.current = extracting;
  activeServerIdRef.current = activeServerId;

  // Listener postMessage dari hidden extraction iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== "ANISUB_VIDEO_URL") return;
      const rawUrl = e.data.url as string;
      if (!rawUrl || !extractingRef.current) return;

      // Wrap melalui stream proxy untuk bypass CORS
      let originParam = "";
      try {
        const vUrl = videoUrlRef.current;
        if (vUrl) originParam = encodeURIComponent(new URL(vUrl).origin + "/");
      } catch { /* skip */ }
      const proxyUrl = rawUrl.startsWith("/api/proxy/stream?")
        ? rawUrl
        : `/api/proxy/stream?url=${encodeURIComponent(rawUrl)}${originParam ? `&origin=${originParam}` : ""}`;

      setExtractedUrl(prev => prev || proxyUrl);
      setExtracting(false);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Auto-load best server + catat penonton nyata dari AniSub
  useEffect(() => {
    if (!episode) return;
    addHistory({ animeId: episode.animeId ?? episodeId ?? "", episodeId: episodeId!, episodeNum: extractEpNum(episode.title), title: cleanTitle(episode.title), poster: "" });
    if (episodeId) incrementWatchCount(episodeId);
    const all = flattenServers(episode);
    const availableQualities = [...new Set(all.map(s => s.quality))];
    const best = pickBestQuality(availableQualities);
    setQualityFilter(best);
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (all.length === 0) {
      if (episode.defaultStreamingUrl) { setVideoUrl(episode.defaultStreamingUrl); setActiveServerId("default"); }
      return;
    }
    const qualityOrder = sortQualities(availableQualities);
    const serversByQuality: Record<string, typeof all> = {};
    for (const q of qualityOrder) {
      const seen = new Set<string>();
      serversByQuality[q] = all.filter(s => { if (s.quality !== q || seen.has(s.serverId)) return false; seen.add(s.serverId); return true; });
    }
    const tryServers = async (queue: typeof all, qi = 0): Promise<void> => {
      for (const srv of queue) {
        try {
          setLoadingServer(true); setActiveServerId(srv.serverId);
          const data = await fetchServer(srv.serverId);
          const url = data.url || data.frameOpen || null;
          if (url) { setVideoUrl(url); setLoadingServer(false); return; }
        } catch { /* next */ }
      }
      setLoadingServer(false);
      const ni = qi + 1;
      if (ni < qualityOrder.length) { setQualityFilter(qualityOrder[ni]); await tryServers(serversByQuality[qualityOrder[ni]] ?? [], ni); }
      else if (episode.defaultStreamingUrl) { setVideoUrl(episode.defaultStreamingUrl); setActiveServerId("default"); }
    };
    const pref = getServerPref();
    const bestServers = serversByQuality[best ?? ""] ?? [];
    const sorted = pref ? [...bestServers].sort((a, b) => a.title.toLowerCase().includes(pref.toLowerCase()) ? -1 : b.title.toLowerCase().includes(pref.toLowerCase()) ? 1 : 0) : bestServers;
    const initialQueue = sorted.length > 0 ? sorted : (serversByQuality[qualityOrder[0]] ?? []);

    // Build full flat queue untuk fallback saat proxy gagal reach server (DNS error).
    // Urutan: server yang dipilih auto-load pertama, lalu server sisa per kualitas.
    const seenSrv = new Set<string>();
    const fullQueue: typeof all = [];
    const addUniq = (srvs: typeof all) => { for (const s of srvs) { if (!seenSrv.has(s.serverId)) { seenSrv.add(s.serverId); fullQueue.push(s); } } };
    addUniq(initialQueue);
    for (const q of qualityOrder) addUniq(serversByQuality[q] ?? []);
    allServersRef.current = fullQueue;

    setLoadingServer(true);
    tryServers(initialQueue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode]);

  // AniSkip
  useEffect(() => {
    setSkipInterval(null);
    if (!episode) return;
    const animeTitle = cleanTitle(episode.title).replace(/\s+Episode\s+\d+/i, "").trim();
    const epNum = parseInt(extractEpNum(episode.title));
    if (!animeTitle || isNaN(epNum)) return;
    let cancelled = false;
    fetchSkipInterval(animeTitle, epNum).then(interval => { if (!cancelled && interval) setSkipInterval(interval); }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.title]);

  // Prefetch next episode — dijalankan saat episode SEKARANG masih ditonton, supaya begitu
  // user pindah ke episode berikutnya semuanya (metadata + link server video) udah siap
  // di cache dan nggak nge-lag/nunggu loading lagi.
  useEffect(() => {
    if (!episode?.nextEpisode?.episodeId) return;
    const nextId = episode.nextEpisode.episodeId;

    (async () => {
      try {
        // 1. Prefetch metadata episode berikutnya (masuk react-query cache, otomatis
        //    di-persist ke IndexedDB juga lewat PersistQueryClientProvider).
        const nextEpisode = await queryClient.fetchQuery({
          queryKey: ["episode", nextId],
          queryFn: () => fetchEpisode(nextId),
          staleTime: 30 * 60_000,
        });

        // 2. Tentukan server terbaik (kualitas terbaik + preferensi server user, sama
        //    seperti logika auto-load) dan prefetch link streaming-nya juga.
        const allServers = flattenServers(nextEpisode);
        if (allServers.length === 0) return;
        const availableQualities = [...new Set(allServers.map(s => s.quality))];
        const best = pickBestQuality(availableQualities);
        const pref = getServerPref();
        const bestServers = allServers.filter(s => s.quality === best);
        const sorted = pref
          ? [...bestServers].sort((a, b) => a.title.toLowerCase().includes(pref.toLowerCase()) ? -1 : b.title.toLowerCase().includes(pref.toLowerCase()) ? 1 : 0)
          : bestServers;
        const candidate = sorted[0] ?? allServers[0];
        if (candidate) {
          queryClient.prefetchQuery({
            queryKey: ["server", candidate.serverId],
            queryFn: () => fetchServer(candidate.serverId),
            staleTime: 30 * 60_000,
          }).catch(() => {});
        }
      } catch { /* prefetch best-effort — jangan ganggu playback episode sekarang */ }
    })();

    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      // Ikut warm-cache poster anime ini juga (dipakai lagi di halaman detail/episode
      // list berikutnya) — bukan cuma metadata episode, biar transisi berasa instan.
      const posterUrls = animeDetail?.poster ? [proxyImg(animeDetail.poster, 300)] : [];
      navigator.serviceWorker.controller.postMessage({ type: "PREFETCH_EPISODE", episodeId: nextId, posterUrls });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.nextEpisode?.episodeId, animeDetail?.poster]);

  // Iframe progress tracker — hanya aktif jika video belum berhasil diekstrak
  useEffect(() => {
    if (!videoUrl || !episodeId) return;
    const effectiveUrl = extractedUrl || videoUrl;
    const isProxyUrl = effectiveUrl.includes("/api/proxy/stream?");
    const isDirect = isProxyUrl || effectiveUrl.endsWith(".mp4") || effectiveUrl.endsWith(".m3u8") || effectiveUrl.endsWith(".webm") || effectiveUrl.includes(".mp4?") || effectiveUrl.includes(".m3u8?");
    if (isDirect) return;
    if (iframeTimerRef.current) clearInterval(iframeTimerRef.current);
    const saved = getProgress(episodeId);
    iframeSavedPosRef.current = saved?.position ?? 0;
    iframeStartRef.current = Date.now();
    iframePlayingRef.current = true;
    const nextEpId = episode?.nextEpisode?.episodeId;
    const dur = saved?.duration ?? IFRAME_DEFAULT_DURATION;
    setDurationSec(dur);
    iframeTimerRef.current = setInterval(() => {
      if (!iframePlayingRef.current) {
        // Paused: show frozen position without advancing
        setElapsedSec(iframeSavedPosRef.current);
        return;
      }
      const elapsed = (Date.now() - iframeStartRef.current) / 1000;
      const newPos = Math.min(iframeSavedPosRef.current + elapsed, dur);
      setElapsedSec(newPos);
      saveProgress(episodeId, newPos, dur);
      if (autoNextEp && nextEpId && newPos >= dur - 30) {
        clearInterval(iframeTimerRef.current!); iframeTimerRef.current = null;
        setLocation(`/watch/${nextEpId}`);
      }
    }, 1000);
    return () => { if (iframeTimerRef.current) { clearInterval(iframeTimerRef.current); iframeTimerRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, episodeId, extractedUrl]);

  // Orientation change
  useEffect(() => {
    const handler = () => {
      const isLand = window.innerWidth > window.innerHeight;
      setIsLandscape(isLand);
      if (!isLand) { try { (screen.orientation as unknown as { unlock?: () => void }).unlock?.(); } catch (_) {} }
    };
    if (screen.orientation) screen.orientation.addEventListener("change", handler);
    window.addEventListener("resize", handler);
    return () => {
      if (screen.orientation) screen.orientation.removeEventListener("change", handler);
      window.removeEventListener("resize", handler);
    };
  }, []);

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    const vid = document.querySelector<HTMLVideoElement>("video");
    if (vid) vid.volume = v / 100;
  };

  const handleToggleLandscape = async () => {
    if (isLandscape) {
      setIsLandscape(false);
      await unlockOrientation();
    } else {
      setIsLandscape(true);
      // Fullscreen (with vendor fallbacks) hides the browser address bar and,
      // on most Android browsers, the on-screen navigation bar too — needed so
      // the "fill left/right" crop reaches the true physical screen edge instead
      // of stopping short at the reserved nav-bar strip.
      await requestAppFullscreen(document.documentElement);
      await lockLandscape();
    }
  };

  const handleSkipOpDone = (skippedTo: number) => {
    if (!episodeId) return;
    const saved = getProgress(episodeId);
    const dur = saved?.duration ?? IFRAME_DEFAULT_DURATION;
    saveProgress(episodeId, skippedTo, dur);
    iframeSavedPosRef.current = skippedTo;
    iframeStartRef.current = Date.now();
    setElapsedSec(skippedTo);
    setSkipToast("⏭ Opening diskip!");
    setTimeout(() => setSkipToast(null), 2500);
  };

  const handleSeek = (ratio: number) => {
    const effectiveUrl = extractedUrl || videoUrl;
    const isProxy = !!effectiveUrl?.includes('/api/proxy/stream?');
    const isDirect = isProxy || effectiveUrl?.endsWith(".mp4") || effectiveUrl?.endsWith(".m3u8") || effectiveUrl?.endsWith(".webm") || effectiveUrl?.includes(".mp4?") || effectiveUrl?.includes(".m3u8?");
    if (isDirect) {
      // PlayerCore handles the actual video.currentTime seek via videoRef.current.
      // Here we just update the parent display state.
      const vid = document.querySelector<HTMLVideoElement>("video");
      const dur = vid && isFinite(vid.duration) && vid.duration > 0 ? vid.duration : durationSec;
      const newPos = ratio * dur;
      setElapsedSec(newPos);
    } else {
      // iframe: update estimated position; PlayerCore handles the actual iframe seek.
      const newPos = ratio * durationSec;
      iframeSavedPosRef.current = newPos;
      iframeStartRef.current = Date.now();
      setElapsedSec(newPos);
    }
  };

  function extractEpNum(t: string) { const m = t.match(/Episode\s+(\d+)/i); return m ? m[1] : "?"; }
  function cleanTitle(t: string) { return t.replace(/\s+Subtitle\s+Indonesia/i, "").trim(); }

  const animeKey = episode?.animeId || episodeId || "";
  const handleLike = () => {
    const ns: LikeState = { liked: !likeState.liked, disliked: false, likes: likeState.likes + (!likeState.liked ? 1 : -1), dislikes: likeState.disliked ? likeState.dislikes - 1 : likeState.dislikes };
    setLikeState(ns); saveLikes(animeKey, ns);
  };
  const handleDislike = () => {
    const ns: LikeState = { disliked: !likeState.disliked, liked: false, dislikes: likeState.dislikes + (!likeState.disliked ? 1 : -1), likes: likeState.liked ? likeState.likes - 1 : likeState.likes };
    setLikeState(ns); saveLikes(animeKey, ns);
  };

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");

  const handleSendComment = () => {
    if (!commentInput.trim() || !episodeId) return;
    const profile = getProfile();
    const newComment: CommentItem = { id: `c_${Date.now()}`, username: profile.username || "Penonton", rank: "F", text: commentInput.trim(), timestamp: Date.now(), likes: 0, likedByUser: false, replies: [] };
    const updated = [newComment, ...comments];
    setComments(updated); saveComments(episodeId, updated);
    setCommentInput("");
  };

  const handleSendReply = (commentId: string) => {
    if (!replyInput.trim() || !episodeId) return;
    const profile = getProfile();
    const reply: ReplyItem = { id: `r_${Date.now()}`, username: profile.username || "Penonton", text: replyInput.trim(), timestamp: Date.now() };
    const updated = comments.map(c => c.id === commentId ? { ...c, replies: [...(c.replies || []), reply] } : c);
    setComments(updated); saveComments(episodeId, updated);
    setReplyInput(""); setReplyingTo(null);
  };

  const handleLikeComment = (commentId: string) => {
    if (!episodeId) return;
    const updated = comments.map(c => c.id === commentId ? { ...c, likes: c.likedByUser ? c.likes - 1 : c.likes + 1, likedByUser: !c.likedByUser } : c);
    setComments(updated); saveComments(episodeId, updated);
  };

  // Server list for sheet
  const allServers = episode ? flattenServers(episode) : [];
  const currentServerIdx = allServers.findIndex(s => s.serverId === activeServerId);
  const serverLabel = currentServerIdx >= 0 ? `S${currentServerIdx + 1}` : "S1";

  // Episode list
  const episodeListItems: EpisodeListItem[] = animeDetail?.episodeList ?? [];

  // Viewer count + jam rilis per episode — selalu ada berkat fallback ekstrapolasi
  const totalEpsForMeta = parseInt(animeDetail?.episodes ?? "0") || episodeListItems.length || 1;
  const epMeta = buildEpisodeMeta(watchRich, totalEpsForMeta);

  // Auto-next episode toggle
  const handleAutoNextToggle = () => {
    const next = !autoNextEp;
    setAutoNextEp(next);
    localStorage.setItem("anisub_autonext", next ? "true" : "false");
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100dvh", background: "linear-gradient(160deg,#06060f 0%,#0c0820 100%)", display: "flex", flexDirection: "column" }}>
        <style>{`
          @keyframes shimmer-load { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
          @keyframes pulse-soft { 0%,100%{opacity:0.5} 50%{opacity:1} }
        `}</style>
        <div style={{ width: "100%", aspectRatio: "16/9", background: "linear-gradient(90deg,#0d0d20 25%,#12102a 50%,#0d0d20 75%)", backgroundSize: "200% 100%", animation: "shimmer-load 1.8s ease-in-out infinite" }}/>
        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {[["60%","20px"],["30%","14px"],["100%","40px"]].map(([w,h],i) => (
            <div key={i} style={{ height: h, borderRadius: 10, background: "linear-gradient(90deg,#0d0d20 25%,#12102a 50%,#0d0d20 75%)", backgroundSize: "200% 100%", width: w, animation: `shimmer-load 1.8s ease-in-out ${i*0.2}s infinite` }}/>
          ))}
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#06060f 0%,#0c0820 100%)" }}>
        <div style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>😢</div>
          <p style={{ color: "#fff", fontWeight: 800, fontSize: 16, margin: "0 0 6px" }}>Gagal memuat episode</p>
          <p style={{ color: "#64748B", fontSize: 13, margin: "0 0 20px" }}>Coba lagi beberapa saat</p>
          <button onClick={() => history.back()} style={{ padding: "10px 28px", borderRadius: 999, background: "linear-gradient(135deg,#FB923C,#F43F5E)", color: "#fff", fontWeight: 800, fontSize: 14, boxShadow: "0 8px 24px rgba(251,146,60,0.4)" }}>← Kembali</button>
        </div>
      </div>
    );
  }

  const epNum = extractEpNum(episode.title);
  const animeTitle = cleanTitle(episode.title).replace(/\s+Episode\s+\d+/i, "").trim();
  const episodeLabel = `Ep ${epNum} - ${animeTitle}`;

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(180deg,#06060f 0%,#080814 60%,#07070e 100%)", display: "flex", flexDirection: "column" }}>
      {/* Full-screen brightness dimmer — covers entire page like real screen brightness control */}
      {brightness < 100 && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99998, pointerEvents: "none",
          background: `rgba(0,0,0,${Math.max(0, ((100 - brightness) / 100) * 0.82).toFixed(3)})`,
          transition: "background 0.08s linear",
        }} />
      )}
      <style>{`
        @keyframes glow-pulse { 0%,100%{box-shadow:0 0 8px rgba(251,146,60,0.3)} 50%{box-shadow:0 0 22px rgba(251,146,60,0.7)} }
        @keyframes float-y { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes slide-up-in { from{opacity:0;transform:translateX(-50%) translateY(16px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes badge-pop { 0%{transform:scale(0.7);opacity:0} 70%{transform:scale(1.12)} 100%{transform:scale(1);opacity:1} }
        @keyframes ep-glow { 0%,100%{box-shadow:0 0 0 transparent} 50%{box-shadow:0 0 14px rgba(251,146,60,0.5)} }
        @keyframes comment-in { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin-slow { to{transform:rotate(360deg)} }
        @keyframes rainbow-border { 0%{border-color:#FB923C} 33%{border-color:#A855F7} 66%{border-color:#22D3EE} 100%{border-color:#FB923C} }
      `}</style>

      {/* ── Skip Toast ── */}
      {skipToast && (
        <div style={{ position: "fixed", top: 64, left: "50%", zIndex: 9999, padding: "10px 22px", borderRadius: 999, background: "linear-gradient(135deg,rgba(251,146,60,0.97),rgba(244,63,94,0.97))", color: "#fff", fontWeight: 900, fontSize: 13, backdropFilter: "blur(16px)", boxShadow: "0 8px 32px rgba(251,146,60,0.5)", animation: "slide-up-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}>
          {skipToast}
        </div>
      )}

      {/* ── Video Player ── */}
      <div style={{ position: "relative", width: "100%", flexShrink: 0 }}>

        {/* Semua server habis / tidak ada yg bisa diakses → error UI dgn tombol ganti manual */}
        {serverExhausted && (
          <div style={{ width: "100%", aspectRatio: "16/9", background: "linear-gradient(135deg,#060612,#0e0b20)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 40 }}>📡</div>
            <p style={{ fontSize: 14, color: "#F87171", fontWeight: 800, margin: 0 }}>Server tidak bisa diakses</p>
            <p style={{ fontSize: 11, color: "#64748B", fontWeight: 600, margin: "0 0 4px", textAlign: "center", padding: "0 24px" }}>Semua mirror gagal terhubung • Coba pilih server lain secara manual</p>
            <button onClick={() => setShowServerSheet(true)}
              style={{ padding: "10px 24px", borderRadius: 999, background: "linear-gradient(135deg,#FB923C,#F43F5E)", color: "#fff", fontWeight: 800, fontSize: 13, border: "none", boxShadow: "0 6px 20px rgba(251,146,60,0.4)", cursor: "pointer" }}>
              🖥️ Pilih Server Lain
            </button>
          </div>
        )}

        {!serverExhausted && (loadingServer || (!videoUrl && !loadingServer)) && (
          <div style={{ width: "100%", aspectRatio: "16/9", background: "linear-gradient(135deg,#060612,#0e0b20)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }}>
            <div style={{ position: "relative", width: 52, height: 52 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(168,85,247,0.15)", borderTopColor: "#FB923C", animation: "spin 0.75s linear infinite" }}/>
              <div style={{ position: "absolute", inset: 6, borderRadius: "50%", border: "2px solid rgba(251,146,60,0.1)", borderBottomColor: "#A855F7", animation: "spin 1.2s linear infinite reverse" }}/>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎬</div>
            </div>
            <p style={{ fontSize: 12, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em" }}>{loadingServer ? "⚡ Memuat server…" : "🎥 Memuat video…"}</p>
          </div>
        )}

        {/* Hidden extraction iframe — intercept video URL via postMessage while extracting */}
        {!loadingServer && videoUrl && extracting && !isAlreadyDirect && (
          <iframe key={`extractor-${videoUrl}`} src={`/api/proxy/embed?url=${encodeURIComponent(videoUrl)}`} allow="autoplay" title="extractor"
            style={{ display: "none", position: "fixed", top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: "none", border: "none" }}/>
        )}

        {/* Loading spinner while extracting — PlayerCore TIDAK dirender dulu untuk cegah double controls */}
        {!loadingServer && videoUrl && extracting && !isAlreadyDirect && !extractedUrl && (
          <div style={{ width: "100%", aspectRatio: "16/9", background: "linear-gradient(135deg,#060612,#0e0b20)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }}>
            <div style={{ position: "relative", width: 52, height: 52 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(168,85,247,0.15)", borderTopColor: "#FB923C", animation: "spin 0.75s linear infinite" }}/>
              <div style={{ position: "absolute", inset: 6, borderRadius: "50%", border: "2px solid rgba(251,146,60,0.1)", borderBottomColor: "#A855F7", animation: "spin 1.2s linear infinite reverse" }}/>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎬</div>
            </div>
            <p style={{ fontSize: 12, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em" }}>🎥 Memuat video…</p>
          </div>
        )}

        {/* PlayerCore — muncul hanya saat URL siap: direct URL, hasil extraction, atau proxy/embed fallback.
            Proxy/embed fallback menyuntik CSS untuk menyembunyikan kontrol player asli situs sumber → tidak ada kontrol dobel. */}
        {!loadingServer && videoUrl && (!extracting || isAlreadyDirect || extractedUrl) && (
          <div style={{ position: "relative" }} key={extractedUrl ? `direct:${extractedUrl}` : `embed:${videoUrl}`}>
            <PlayerCore
              url={extractedUrl ?? (isAlreadyDirect ? videoUrl : `/api/proxy/embed?url=${encodeURIComponent(videoUrl)}`)}
              episodeId={episodeId!} title={episode.title} episodeLabel={episodeLabel}
              isLandscape={isLandscape} onToggleLandscape={handleToggleLandscape}
              hasPrev={!!episode.prevEpisode} hasNext={!!episode.nextEpisode}
              onPrev={() => episode.prevEpisode && setLocation(`/watch/${episode.prevEpisode.episodeId}`)}
              onNext={() => episode.nextEpisode && setLocation(`/watch/${episode.nextEpisode.episodeId}`)}
              autoSkipOp={autoSkipOp} onSkipOpDone={handleSkipOpDone}
              skipStart={skipInterval?.startTime} skipEnd={skipInterval?.endTime}
              hdQuality={qualityFilter ?? undefined}
              playbackSpeed={playbackSpeed} onSpeedClick={() => setShowSpeedSheet(true)}
              brightness={brightness} onBrightnessChange={setBrightness}
              volume={volume} onVolumeChange={handleVolumeChange}
              showEpList={showEpList} onToggleEpList={() => setShowEpList(v => !v)}
              onQualityClick={() => setShowServerSheet(true)}
              elapsedSec={elapsedSec} durationSec={durationSec || IFRAME_DEFAULT_DURATION}
              onSeek={handleSeek} autoNextEp={autoNextEp}
              onTimeUpdate={(elapsed, dur) => { setElapsedSec(elapsed); if (dur > 0) setDurationSec(dur); }}
              onPlayStateChange={(playing) => {
                iframePlayingRef.current = playing;
                if (playing) { iframeStartRef.current = Date.now() - iframeSavedPosRef.current * 1000; }
                else {
                  const frozenPos = iframeSavedPosRef.current + (Date.now() - iframeStartRef.current) / 1000;
                  iframeSavedPosRef.current = Math.min(frozenPos, durationSec || IFRAME_DEFAULT_DURATION);
                  iframeStartRef.current = Date.now();
                }
              }}
            />
            {showEpList && (
              isLandscape
                ? <div style={{ position: "fixed", inset: 0, zIndex: 10001 }}>
                    <EpisodeListPanel episodes={episodeListItems.length ? episodeListItems : [{ title: epNum, episodeId: episodeId! }]} currentEpId={episodeId!} onSelect={id => { setShowEpList(false); setLocation(`/watch/${id}`); }} onClose={() => setShowEpList(false)} epMeta={epMeta}/>
                  </div>
                : <EpisodeListPanel episodes={episodeListItems.length ? episodeListItems : [{ title: epNum, episodeId: episodeId! }]} currentEpId={episodeId!} onSelect={id => { setShowEpList(false); setLocation(`/watch/${id}`); }} onClose={() => setShowEpList(false)} epMeta={epMeta}/>
            )}
          </div>
        )}
      </div>

      {/* ── Below Video (portrait only) ── */}
      {!isLandscape && (
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 88 }}>

          {/* ── NOW PLAYING card ── */}
          <div style={{ margin: "12px 14px 0", padding: "14px 16px 12px", borderRadius: 20, background: "linear-gradient(135deg,rgba(168,85,247,0.12) 0%,rgba(251,146,60,0.08) 100%)", border: "1px solid rgba(168,85,247,0.2)", position: "relative", overflow: "hidden" }}>
            {/* Glow orb */}
            <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle,rgba(168,85,247,0.18) 0%,transparent 70%)", pointerEvents: "none" }}/>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, position: "relative" }}>
              <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#A855F7,#FB923C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "0 4px 16px rgba(168,85,247,0.45)", animation: "float-y 3s ease-in-out infinite" }}>🎬</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", color: "#A855F7", textTransform: "uppercase" }}>▶ NOW PLAYING</span>
                  <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 99, background: "rgba(251,146,60,0.2)", color: "#FB923C", fontWeight: 800, animation: "badge-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}>EP {epNum}</span>
                </div>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{animeTitle}</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: "#38BDF8" }}>
                    👁 {formatViewers(epMeta.getViewers(episodeId!, isNaN(parseInt(epNum)) ? 1 : parseInt(epNum)) + getWatchCount(episodeId ?? ""))}
                    <span style={{ color: "#475569", fontWeight: 600 }}>ditonton</span>
                  </span>
                  {(() => {
                    const n = parseInt(epNum);
                    const airAt = !isNaN(n) ? epMeta.airDateMap.get(n) : undefined;
                    return airAt ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#A78BFA" }}>🗓 {fmtEpDate(airAt)}</span>
                    ) : null;
                  })()}
                  {epMeta.isFinished && (
                    <span style={{ fontSize: 10, fontWeight: 900, color: "#FFD700", letterSpacing: "0.04em" }}>🏆 TAMAT</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Action pills ── */}
          <div style={{ padding: "12px 14px 4px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Like */}
            <button onClick={handleLike}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, background: likeState.liked ? "linear-gradient(135deg,rgba(96,165,250,0.25),rgba(59,130,246,0.15))" : "rgba(255,255,255,0.06)", border: likeState.liked ? "1.5px solid rgba(96,165,250,0.6)" : "1px solid rgba(255,255,255,0.1)", transition: "all 0.25s", boxShadow: likeState.liked ? "0 0 16px rgba(96,165,250,0.3)" : "none" }}>
              <span style={{ fontSize: 14 }}>{likeState.liked ? "💙" : "🤍"}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: likeState.liked ? "#60A5FA" : "#94A3B8" }}>{likeState.likes}</span>
            </button>
            {/* Dislike */}
            <button onClick={handleDislike}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, background: likeState.disliked ? "linear-gradient(135deg,rgba(248,113,113,0.25),rgba(239,68,68,0.15))" : "rgba(255,255,255,0.06)", border: likeState.disliked ? "1.5px solid rgba(248,113,113,0.6)" : "1px solid rgba(255,255,255,0.1)", transition: "all 0.25s", boxShadow: likeState.disliked ? "0 0 16px rgba(248,113,113,0.3)" : "none" }}>
              <span style={{ fontSize: 14 }}>{likeState.disliked ? "💔" : "🩶"}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: likeState.disliked ? "#F87171" : "#94A3B8" }}>{likeState.dislikes}</span>
            </button>
            {/* Quality */}
            <button onClick={() => setShowServerSheet(true)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 999, background: "linear-gradient(135deg,rgba(251,191,36,0.15),rgba(234,179,8,0.08))", border: "1px solid rgba(251,191,36,0.4)" }}>
              <span style={{ fontSize: 13 }}>⭐</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#FBBF24" }}>{qualityFilter ?? "HD"}</span>
            </button>
            {/* Server */}
            <button onClick={() => setShowServerSheet(true)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 999, background: "linear-gradient(135deg,rgba(34,211,238,0.15),rgba(6,182,212,0.08))", border: "1px solid rgba(34,211,238,0.35)" }}>
              <span style={{ fontSize: 13 }}>🖥️</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#22D3EE" }}>{serverLabel}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8" }}>Ganti</span>
            </button>
          </div>

          {/* ── Auto-next + controls row ── */}
          <div style={{ padding: "6px 14px 12px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleAutoNextToggle}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999, background: autoNextEp ? "linear-gradient(135deg,rgba(251,146,60,0.22),rgba(244,63,94,0.14))" : "rgba(255,255,255,0.06)", border: autoNextEp ? "1.5px solid rgba(251,146,60,0.55)" : "1px solid rgba(255,255,255,0.09)", transition: "all 0.25s", boxShadow: autoNextEp ? "0 0 18px rgba(251,146,60,0.28)" : "none" }}>
              <span style={{ fontSize: 14 }}>{autoNextEp ? "⚡" : "⏭️"}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: autoNextEp ? "#FB923C" : "#64748B" }}>Auto Next</span>
              <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 999, background: autoNextEp ? "rgba(251,146,60,0.35)" : "rgba(255,255,255,0.08)", color: autoNextEp ? "#FB923C" : "#475569", letterSpacing: "0.05em" }}>{autoNextEp ? "ON" : "OFF"}</span>
            </button>
            <button onClick={() => setShowSpeedSheet(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, background: "linear-gradient(135deg,rgba(74,222,128,0.15),rgba(34,197,94,0.08))", border: "1px solid rgba(74,222,128,0.35)" }}>
              <span style={{ fontSize: 13 }}>🚀</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#4ADE80" }}>{playbackSpeed}x</span>
            </button>
          </div>

          {/* ── Episode list ── */}
          <div style={{ margin: "0 14px 14px", borderRadius: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 16 }}>📺</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>Daftar Episode</span>
              <span style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(168,85,247,0.15)", color: "#C084FC", fontWeight: 800 }}>{episodeListItems.length || 1} Eps</span>
            </div>
            <div style={{ display: "flex", gap: 7, padding: "10px 14px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {(episodeListItems.length > 0 ? episodeListItems : [{ title: epNum, episodeId: episodeId! }]).map((ep) => {
                const isCurrent = ep.episodeId === episodeId;
                return (
                  <button key={ep.episodeId}
                    onClick={() => { if (!isCurrent) setLocation(`/watch/${ep.episodeId}`); }}
                    style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12, background: isCurrent ? "linear-gradient(135deg,#FB923C,#F43F5E)" : "rgba(255,255,255,0.06)", border: isCurrent ? "none" : "1px solid rgba(255,255,255,0.09)", color: "#fff", boxShadow: isCurrent ? "0 4px 14px rgba(251,146,60,0.5)" : "none", transform: isCurrent ? "scale(1.1)" : "scale(1)", transition: "all 0.2s", animation: isCurrent ? "ep-glow 2s ease-in-out infinite" : "none" }}>
                    {ep.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Nav prev/next ep ── */}
          {(episode.prevEpisode || episode.nextEpisode) && (
            <div style={{ margin: "0 14px 14px", display: "flex", gap: 10 }}>
              <button onClick={() => episode.prevEpisode && setLocation(`/watch/${episode.prevEpisode.episodeId}`)}
                disabled={!episode.prevEpisode}
                style={{ flex: 1, padding: "11px 14px", borderRadius: 16, background: episode.prevEpisode ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.03)", border: episode.prevEpisode ? "1px solid rgba(168,85,247,0.3)" : "1px solid rgba(255,255,255,0.05)", color: episode.prevEpisode ? "#C084FC" : "#334155", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: episode.prevEpisode ? 1 : 0.4, transition: "all 0.2s" }}>
                <span style={{ fontSize: 14 }}>⬅️</span> Ep Sebelumnya
              </button>
              <button onClick={() => episode.nextEpisode && setLocation(`/watch/${episode.nextEpisode.episodeId}`)}
                disabled={!episode.nextEpisode}
                style={{ flex: 1, padding: "11px 14px", borderRadius: 16, background: episode.nextEpisode ? "linear-gradient(135deg,rgba(251,146,60,0.18),rgba(244,63,94,0.12))" : "rgba(255,255,255,0.03)", border: episode.nextEpisode ? "1px solid rgba(251,146,60,0.4)" : "1px solid rgba(255,255,255,0.05)", color: episode.nextEpisode ? "#FB923C" : "#334155", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: episode.nextEpisode ? 1 : 0.4, transition: "all 0.2s" }}>
                Ep Selanjutnya <span style={{ fontSize: 14 }}>➡️</span>
              </button>
            </div>
          )}

          {/* ── LawrenzBot AI Chat (Watch mode) ── */}
          <AnimeAIChat
            watchMode
            context={{
              title: animeTitle,
              synopsis: animeDetail?.synopsis?.paragraphList
                ?.map((p) => (typeof p === "string" ? p : p.content))
                .join(" ")
                .slice(0, 500),
              genres: animeDetail?.genreList?.map((g) => g.title),
              studios: animeDetail?.studios,
              status: animeDetail?.status,
              episodes: animeDetail?.episodes,
              score: animeDetail?.score,
              aired: animeDetail?.aired,
              currentEpisode: `Episode ${epNum}`,
            }}
          />

          {/* ── Divider with label ── */}
          <div style={{ margin: "0 14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent,rgba(168,85,247,0.3),transparent)" }}/>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#64748B", display: "flex", alignItems: "center", gap: 4 }}>
              <span>💬</span> KOMENTAR
            </span>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent,rgba(168,85,247,0.3),transparent)" }}/>
          </div>

          {/* ── Comments ── */}
          <div style={{ padding: "0 14px" }}>
            {/* Input */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSendComment(); }}
                  placeholder="✍️ Tulis pendapatmu..."
                  style={{ width: "100%", padding: "11px 46px 11px 16px", borderRadius: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(168,85,247,0.25)", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 18, pointerEvents: "none" }}>{commentInput ? "✨" : "💭"}</span>
              </div>
              <button onClick={handleSendComment}
                style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg,#A855F7,#FB923C)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 6px 20px rgba(168,85,247,0.45)", fontSize: 18 }}>
                🚀
              </button>
            </div>

            {/* Count */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: "#fff" }}>Semua Komentar</span>
              <span style={{ padding: "2px 10px", borderRadius: 999, background: "linear-gradient(135deg,rgba(168,85,247,0.2),rgba(251,146,60,0.15))", fontSize: 11, fontWeight: 800, color: "#C084FC", border: "1px solid rgba(168,85,247,0.3)" }}>{comments.length}</span>
            </div>

            {comments.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0 20px" }}>
                <div style={{ fontSize: 48, marginBottom: 10, animation: "float-y 3s ease-in-out infinite" }}>💬</div>
                <p style={{ color: "#64748B", fontWeight: 700, fontSize: 14, margin: 0 }}>Belum ada komentar</p>
                <p style={{ color: "#475569", fontSize: 12, margin: "4px 0 0" }}>Jadilah yang pertama! 🎉</p>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {comments.map((c, ci) => {
                const hue = c.username.charCodeAt(0) * 37 % 360;
                const avatarGrad = `linear-gradient(135deg,hsl(${hue},70%,45%),hsl(${(hue+60)%360},65%,35%))`;
                return (
                  <div key={c.id} style={{ animation: `comment-in 0.3s ease ${ci * 0.05}s both` }}>
                    <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", transition: "border-color 0.2s" }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: avatarGrad, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, fontSize: 15, color: "#fff", boxShadow: `0 4px 12px hsla(${hue},70%,45%,0.4)` }}>
                        {c.username.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 900, color: "#fff" }}>{c.username}</span>
                          <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 999, background: `hsla(${hue},70%,45%,0.2)`, color: `hsl(${hue},75%,65%)`, fontWeight: 800, border: `1px solid hsla(${hue},70%,45%,0.4)` }}>Lv. {c.rank}</span>
                        </div>
                        <p style={{ margin: "5px 0 8px", fontSize: 13, color: "#CBD5E1", lineHeight: 1.55 }}>{c.text}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <span style={{ fontSize: 10, color: "#475569" }}>{new Date(c.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                          <button onClick={() => handleLikeComment(c.id)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", padding: 0 }}>
                            <span style={{ fontSize: 13 }}>{c.likedByUser ? "💙" : "🤍"}</span>
                            {c.likes > 0 && <span style={{ fontSize: 11, color: c.likedByUser ? "#60A5FA" : "#475569", fontWeight: 800 }}>{c.likes}</span>}
                          </button>
                          <button onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)} style={{ background: "none", padding: 0, fontSize: 11, fontWeight: 800, color: replyingTo === c.id ? "#FB923C" : "#64748B", display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 12 }}>↩️</span> Balas{c.replies?.length ? ` (${c.replies.length})` : ""}
                          </button>
                        </div>
                        {replyingTo === c.id && (
                          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                            <input value={replyInput} onChange={e => setReplyInput(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleSendReply(c.id); }}
                              placeholder={`💬 Balas @${c.username}…`} autoFocus
                              style={{ flex: 1, padding: "9px 13px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(251,146,60,0.35)", color: "#fff", fontSize: 12, outline: "none" }}
                            />
                            <button onClick={() => handleSendReply(c.id)}
                              style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#FB923C,#F43F5E)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>
                              🚀
                            </button>
                          </div>
                        )}
                        {c.replies?.length > 0 && (
                          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, paddingLeft: 14, borderLeft: "2px solid rgba(168,85,247,0.25)" }}>
                            {c.replies.map(r => {
                              const rHue = r.username.charCodeAt(0) * 53 % 360;
                              return (
                                <div key={r.id} style={{ display: "flex", gap: 8 }}>
                                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: `linear-gradient(135deg,hsl(${rHue},65%,42%),hsl(${(rHue+50)%360},60%,32%))`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 900, fontSize: 12, color: "#fff" }}>
                                    {r.username.charAt(0).toUpperCase()}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: "7px 11px" }}>
                                    <span style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>{r.username}</span>
                                    <p style={{ margin: "3px 0 3px", fontSize: 12, color: "#CBD5E1", lineHeight: 1.5 }}>{r.text}</p>
                                    <span style={{ fontSize: 10, color: "#475569" }}>{new Date(r.timestamp).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom spacer decoration */}
            <div style={{ marginTop: 32, textAlign: "center", opacity: 0.4 }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>🌟</div>
              <p style={{ fontSize: 11, color: "#475569", fontWeight: 700 }}>AniSub • Nonton Anime Sub Indo</p>
            </div>
          </div>
        </div>
      )}

      {/* Server sheet */}
      {showServerSheet && allServers.length > 0 && (
        <ServerSheet
          servers={allServers} currentId={activeServerId}
          onSelect={async id => {
            setShowServerSheet(false);
            if (id === activeServerId) return;
            setLoadingServer(true); setActiveServerId(id);
            try { const data = await fetchServer(id); const url = data.url || data.frameOpen || null; if (url) setVideoUrl(url); } catch {}
            setLoadingServer(false);
          }}
          onClose={() => setShowServerSheet(false)}
        />
      )}

      {/* Speed sheet — wrapped in fixed overlay when landscape so it clears the player z-index:9999 */}
      {showSpeedSheet && (
        isLandscape
          ? <div style={{ position: "fixed", inset: 0, zIndex: 10001 }}>
              <SpeedSheet speed={playbackSpeed} onSelect={s => { setPlaybackSpeed(s); setShowSpeedSheet(false); }} onClose={() => setShowSpeedSheet(false)}/>
            </div>
          : <SpeedSheet speed={playbackSpeed} onSelect={s => { setPlaybackSpeed(s); setShowSpeedSheet(false); }} onClose={() => setShowSpeedSheet(false)}/>
      )}
    </div>
  );
}
