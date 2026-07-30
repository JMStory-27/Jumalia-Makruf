import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import Hls from "hls.js";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Loader,
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, Info, Smartphone,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import type { ContentCard, ContentType } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";
import { FALLBACK, fetchDetail } from "@/lib/api";
import { addToHistory } from "@/lib/storage";

const BASE_API = (import.meta.env.BASE_URL ?? "/lawrenz-verse/").replace(/\/$/, "").replace(/\/[^/]+$/, "");
const ALL_FALLBACK = [...FALLBACK.dracin, ...FALLBACK.drakor, ...FALLBACK.film, ...FALLBACK.series];

interface StreamQuality { quality: string; url: string; type: "mp4" | "hls"; }

function toProxy(cdnUrl: string): string {
  const encoded = btoa(cdnUrl);
  return `${BASE_API}/api/lv/video?u=${encodeURIComponent(encoded)}`;
}

async function fetchStreams(slug: string, ep: number, isMovie: boolean): Promise<StreamQuality[]> {
  try {
    const qs = isMovie ? "?movie=1" : "";
    const r = await fetch(`${BASE_API}/api/lv/servers/${encodeURIComponent(slug)}/${ep}${qs}`);
    const j = await r.json() as { ok: boolean; streams: StreamQuality[] };
    if (!j.ok) return [];
    return (j.streams ?? []).map(s => ({ ...s, url: toProxy(s.url) }));
  } catch { return []; }
}

function VideoPlayer({
  streams, primaryColor, secondaryColor, glowColor
}: {
  streams: StreamQuality[];
  primaryColor: string; secondaryColor: string; glowColor: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [qualityIdx, setQualityIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  // 'none' | 'landscape' | 'portrait' — pure CSS fullscreen, no requestFullscreen()
  const [fsMode, setFsMode] = useState<'none' | 'landscape' | 'portrait'>('none');
  const [showControls, setShowControls] = useState(true);
  const [showQuality, setShowQuality] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const failedIdxRef = useRef<Set<number>>(new Set());
  const activeIdxRef = useRef(0);

  // Lock body scroll when fullscreen active; auto-detect phone landscape
  useEffect(() => {
    if (fsMode !== 'none') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [fsMode]);

  // Auto-enter landscape fullscreen when phone is rotated sideways
  useEffect(() => {
    const check = () => {
      const isLand = window.innerWidth > window.innerHeight && window.innerHeight < 520;
      setFsMode(prev => {
        if (isLand && prev === 'none') return 'landscape';
        if (!isLand && prev === 'landscape') return 'none';
        return prev;
      });
    };
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  const activeStream = streams[qualityIdx];

  const mp4CleanupRef = useRef<(() => void) | null>(null);

  const loadStream = useCallback((stream: StreamQuality, idx: number) => {
    const video = videoRef.current;
    if (!video) return;
    activeIdxRef.current = idx;
    setLoading(true); setError(false); setPlaying(false);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    // Clean up any previous mp4 listeners
    if (mp4CleanupRef.current) { mp4CleanupRef.current(); mp4CleanupRef.current = null; }

    const handleFatal = () => {
      failedIdxRef.current.add(activeIdxRef.current);
      const nextIdx = streams.findIndex((_, i) => !failedIdxRef.current.has(i));
      if (nextIdx !== -1) setQualityIdx(nextIdx);
      else setError(true);
    };

    if (stream.type === "hls" && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(stream.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setLoading(false); video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) handleFatal(); });
    } else {
      // mp4 or native hls — use canplay + loadeddata as fallbacks, with timeout guard
      let resolved = false;
      const onReady = () => {
        if (resolved) return;
        resolved = true;
        setLoading(false);
        video.play().catch(() => {});
      };
      // Timeout: if no playable event in 45s, try next stream
      const timeoutId = setTimeout(() => { if (!resolved) handleFatal(); }, 45_000);
      video.addEventListener("canplay", onReady, { once: true });
      video.addEventListener("loadeddata", onReady, { once: true });
      mp4CleanupRef.current = () => {
        clearTimeout(timeoutId);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("loadeddata", onReady);
      };
      video.src = stream.url;
      video.load();
    }
  }, [streams]);

  useEffect(() => {
    failedIdxRef.current = new Set();
    if (activeStream) loadStream(activeStream, qualityIdx);
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      if (mp4CleanupRef.current) { mp4CleanupRef.current(); mp4CleanupRef.current = null; }
    };
  }, [activeStream?.url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
    };
    const onDurationChange = () => setDuration(video.duration);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onError = () => {
      failedIdxRef.current.add(activeIdxRef.current);
      const nextIdx = streams.findIndex((_, i) => !failedIdxRef.current.has(i));
      if (nextIdx !== -1 && nextIdx !== activeIdxRef.current) setQualityIdx(nextIdx);
      else if (failedIdxRef.current.size >= streams.length) setError(true);
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
    };
  }, [streams]);


  const showControlsTemporarily = () => {
    setShowControls(true);
    setShowQuality(false);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3500);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    showControlsTemporarily();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const setVol = (v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v; video.muted = v === 0;
    setVolume(v); setMuted(v === 0);
  };

  const seek = (pct: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = pct * duration;
    showControlsTemporarily();
  };

  // Toggle landscape fullscreen (pure CSS, no requestFullscreen)
  const toggleLandscapeFs = () => setFsMode(m => m === 'landscape' ? 'none' : 'landscape');

  // Toggle portrait fullscreen — video fills hp berdiri atas-bawah
  const togglePortraitFs = () => setFsMode(m => m === 'portrait' ? 'none' : 'portrait');

  // Exit any fullscreen mode
  const exitFs = () => setFsMode('none');

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  if (streams.length === 0) return null;

  const inFs = fsMode !== 'none';
  const containerStyle: React.CSSProperties = inFs
    ? { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999, background: "#000" }
    : { aspectRatio: "16/9" };

  // Portrait mode: video pillar-boxes (left/right black bars) but fills 100% height
  // Landscape mode: video letter-boxes (top/bottom bars) but fills 100% width — same as contain, but we force cover to fill atas-bawah
  const videoStyle: React.CSSProperties = inFs
    ? { display: "block", width: "100%", height: "100%", objectFit: "cover" }
    : { display: "block" };

  return (
    <div
      ref={containerRef}
      className="relative bg-black w-full select-none"
      style={containerStyle}
      onMouseMove={showControlsTemporarily}
      onTouchStart={showControlsTemporarily}
      onClick={togglePlay}
    >
      <video ref={videoRef} className={inFs ? "" : "w-full h-full object-contain"} playsInline preload="auto" style={videoStyle} />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(0,0,0,0.45)" }}>
          <div style={{ position: "relative" }}>
            <Loader size={40} color={primaryColor} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
          style={{ background: "rgba(7,5,14,0.96)" }}>
          <div style={{ fontSize: 40 }}>😵</div>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", textAlign: "center", padding: "0 24px" }}>
            Stream tidak tersedia. Coba kualitas lain.
          </p>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className="absolute inset-0 flex flex-col justify-end transition-opacity duration-300"
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? "auto" : "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient behind controls */}
        <div className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{ height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)" }} />

        <div className="relative px-3 pb-4 flex flex-col gap-2.5">
          {/* Progress track — bigger hit zone */}
          <div className="w-full relative flex items-center cursor-pointer" style={{ height: 20 }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}>
            {/* Track */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full" style={{ height: 4, background: "rgba(255,255,255,0.18)" }}>
              <div className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
                style={{ width: `${bufferedPct}%`, background: "rgba(255,255,255,0.28)" }} />
              <div className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
                style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${primaryColor}, ${secondaryColor})` }} />
            </div>
            {/* Thumb */}
            <div className="absolute top-1/2 -translate-y-1/2 rounded-full shadow-lg"
              style={{
                left: `calc(${progressPct}% - 7px)`, width: 14, height: 14,
                background: primaryColor,
                boxShadow: `0 0 8px ${glowColor}, 0 0 3px rgba(0,0,0,0.6)`,
              }} />
          </div>

          {/* Control buttons row */}
          <div className="flex items-center gap-2">
            {/* Play / Pause — 44px touch target */}
            <button className="w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-90"
              style={{ background: `${primaryColor}22`, border: `1px solid ${primaryColor}40` }}
              onClick={togglePlay}>
              {playing
                ? <Pause size={18} fill="white" color="white" />
                : <Play size={18} fill="white" color="white" style={{ marginLeft: 2 }} />}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1">
              <button onClick={toggleMute} className="w-9 h-9 flex items-center justify-center">
                {muted
                  ? <VolumeX size={16} color="rgba(255,255,255,0.7)" />
                  : <Volume2 size={16} color="rgba(255,255,255,0.7)" />}
              </button>
              <input type="range" min="0" max="1" step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => setVol(parseFloat(e.target.value))}
                style={{ width: 56, height: 3, accentColor: primaryColor, cursor: "pointer" }} />
            </div>

            {/* Time */}
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontFamily: "monospace", flexShrink: 0, letterSpacing: "0.02em" }}>
              {fmt(currentTime)} / {fmt(duration)}
            </span>

            <div className="flex-1" />

            {/* Quality selector */}
            {streams.length > 1 && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowQuality(q => !q); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-bold"
                  style={{
                    fontSize: 11, fontFamily: "'Space Grotesk',sans-serif",
                    background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)",
                    border: "1px solid rgba(255,255,255,0.18)",
                  }}>
                  <Settings size={11} />
                  {streams[qualityIdx]?.quality ?? "Auto"}
                </button>
                {showQuality && (
                  <div className="absolute bottom-10 right-0 rounded-2xl overflow-hidden shadow-2xl"
                    style={{ background: "rgba(14,11,28,0.98)", border: "1px solid rgba(255,255,255,0.1)", minWidth: 110, backdropFilter: "blur(20px)" }}>
                    <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, letterSpacing: "0.1em" }}>
                        KUALITAS
                      </span>
                    </div>
                    {streams.map((s, i) => (
                      <button key={i}
                        onClick={(e) => { e.stopPropagation(); setQualityIdx(i); setShowQuality(false); loadStream(s, i); }}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors"
                        style={{
                          fontSize: 12, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700,
                          color: qualityIdx === i ? primaryColor : "rgba(255,255,255,0.65)",
                          background: qualityIdx === i ? `${primaryColor}14` : "transparent",
                        }}>
                        <span>{s.quality}</span>
                        {qualityIdx === i && <span style={{ fontSize: 9, opacity: 0.7 }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Portrait FS — fills hp berdiri (atas-bawah) */}
            <button
              onClick={(e) => { e.stopPropagation(); togglePortraitFs(); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90"
              title="Full Screen Berdiri"
              style={{
                background: fsMode === 'portrait' ? `${primaryColor}33` : "rgba(255,255,255,0.09)",
                border: `1px solid ${fsMode === 'portrait' ? primaryColor : "rgba(255,255,255,0.14)"}`,
              }}>
              <Smartphone size={15} color={fsMode === 'portrait' ? primaryColor : "rgba(255,255,255,0.8)"} />
            </button>

            {/* Landscape FS — fills hp miring */}
            <button
              onClick={(e) => { e.stopPropagation(); toggleLandscapeFs(); }}
              className="w-9 h-9 flex items-center justify-center rounded-xl transition-all active:scale-90"
              title="Full Screen Miring"
              style={{
                background: fsMode === 'landscape' ? `${primaryColor}33` : "rgba(255,255,255,0.09)",
                border: `1px solid ${fsMode === 'landscape' ? primaryColor : "rgba(255,255,255,0.14)"}`,
              }}>
              {inFs
                ? <Minimize size={15} color={fsMode === 'landscape' ? primaryColor : "rgba(255,255,255,0.8)"} />
                : <Maximize size={15} color="rgba(255,255,255,0.8)" />}
            </button>
          </div>
        </div>
      </div>

      {/* Exit fullscreen button — top-right, visible always when in fs */}
      {inFs && (
        <button
          onClick={(e) => { e.stopPropagation(); exitFs(); }}
          className="absolute top-3 right-3 flex items-center justify-center rounded-full transition-all active:scale-90"
          style={{ width: 36, height: 36, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.18)", zIndex: 10, backdropFilter: "blur(8px)" }}>
          <Minimize size={16} color="white" />
        </button>
      )}

      {/* Watermark */}
      <div className="absolute bottom-14 left-3 pointer-events-none select-none" style={{ opacity: 0.12 }}>
        <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 8, fontWeight: 700, color: primaryColor, letterSpacing: "0.12em" }}>
          ✦ LAWRENZVERSE
        </span>
      </div>
    </div>
  );
}

export default function WatchPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [, navigate] = useLocation();

  const ct = (type as ContentType) ?? "dracin";
  const meta = CATEGORY_META[ct];
  const decodedId = decodeURIComponent(id ?? "");

  const initialEp = parseInt(new URLSearchParams(window.location.search).get("ep") ?? "1") || 1;

  // Only use fallback for display preview; always fetch real detail to get drakoridSlug
  const fallbackItem = ALL_FALLBACK.find((c) => c.id === decodedId);
  const [item, setItem] = useState<ContentCard | undefined>(
    // Use fallback immediately ONLY if it has a valid drakoridSlug (i.e. came from real API)
    fallbackItem?.drakoridSlug ? fallbackItem : undefined
  );
  const [loadingItem, setLoadingItem] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    // Always hit the API to get a complete item with drakoridSlug.
    // If we have a displayable fallback, keep it visible while loading (setLoadingItem false).
    if (fallbackItem) setItem(fallbackItem);
    if (fallbackItem?.drakoridSlug) { setLoadingItem(false); return; }

    let cancelled = false;
    setLoadingItem(true);
    fetchDetail(decodedId, ct).then((d) => {
      if (!cancelled && d) setItem(d);
    }).finally(() => { if (!cancelled) setLoadingItem(false); });
    return () => { cancelled = true; };
  }, [decodedId]);

  useEffect(() => { if (item) addToHistory(item); }, [item?.id]);

  // Use URL type as authoritative source for movie detection (detail API may return wrong mediaType)
  const isMovie = ct === "film" || item?.mediaType === "movie";
  const maxSeasons = item?.totalSeasons ?? 1;
  const maxEpisodes = item?.totalEpisodes || (isMovie ? 1 : 24);

  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(initialEp);
  const [streams, setStreams] = useState<StreamQuality[]>([]);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);

  // Use URL slug directly so streaming starts immediately even before detail loads.
  // item.drakoridSlug is preferred once available (more accurate for remapped slugs).
  const streamSlug = item?.drakoridSlug || decodedId;

  useEffect(() => {
    if (!streamSlug) return;
    let cancelled = false;
    setLoadingStreams(true);
    setStreams([]);
    fetchStreams(streamSlug, episode, isMovie).then((s) => {
      if (!cancelled) { setStreams(s); setLoadingStreams(false); setPlayerKey(k => k + 1); }
    }).catch(() => { if (!cancelled) setLoadingStreams(false); });
    return () => { cancelled = true; };
  }, [streamSlug, episode, isMovie]);

  const allEps = Array.from({ length: Math.min(maxEpisodes, 120) }, (_, i) => i + 1);

  return (
    <div className="min-h-screen pb-24 flex flex-col">

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4"
        style={{
          height: 56,
          background: "rgba(7,5,14,0.97)",
          backdropFilter: "blur(24px)",
          borderBottom: `1px solid ${meta.primaryColor}18`,
        }}>
        <button onClick={() => navigate(-1 as unknown as string)}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <ArrowLeft size={18} color="rgba(255,255,255,0.8)" />
        </button>

        <div className="flex-1 min-w-0">
          {loadingItem
            ? <div className="h-4 w-40 skeleton rounded mb-1" />
            : <p className="text-white/90 text-sm font-bold truncate" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
                {item?.title ?? "Memuat…"}
              </p>}
          <p style={{ fontSize: 11, color: meta.primaryColor, fontFamily: "'Space Grotesk',sans-serif" }}>
            {meta.emoji} {meta.label}{!isMovie ? ` · S${season} E${episode}` : ""}
          </p>
        </div>

        <button onClick={() => setShowInfo(v => !v)}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
          style={{
            background: showInfo ? `${meta.primaryColor}22` : "rgba(255,255,255,0.06)",
            border: `1px solid ${showInfo ? meta.primaryColor + "50" : "rgba(255,255,255,0.1)"}`,
          }}>
          <Info size={16} color={showInfo ? meta.primaryColor : "rgba(255,255,255,0.6)"} />
        </button>
      </div>

      {/* Video player — always start stream loading immediately; don't wait for item detail */}
      <div className="bg-black" style={{ marginTop: 56 }}>
        {loadingStreams ? (
          <div className="flex flex-col items-center justify-center gap-2.5" style={{ aspectRatio: "16/9", background: "#000" }}>
            <Loader size={32} color={meta.primaryColor} style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ color: meta.primaryColor, fontSize: 12, fontFamily: "'Space Grotesk',sans-serif" }}>
              Memuat stream…
            </p>
          </div>
        ) : streams.length > 0 ? (
          <VideoPlayer
            key={playerKey}
            streams={streams}
            primaryColor={meta.primaryColor}
            secondaryColor={meta.secondaryColor}
            glowColor={meta.glowColor}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 px-8"
            style={{ aspectRatio: "16/9", background: "rgba(7,5,14,0.98)" }}>
            <div style={{ fontSize: 44 }}>🎬</div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", textAlign: "center" }}>
              Stream belum tersedia untuk episode ini
            </p>
          </div>
        )}
      </div>

      {/* Info panel (collapsible) */}
      {showInfo && item && (
        <div className="mx-4 mt-3 rounded-2xl overflow-hidden"
          style={{ background: "rgba(14,11,28,0.85)", border: `1px solid ${meta.primaryColor}18`, backdropFilter: "blur(16px)" }}>
          <div className="flex gap-3 p-4">
            {item.poster && (
              <div className="flex-shrink-0" style={{
                width: 64, height: 96, borderRadius: 10,
                border: `1.5px solid ${meta.primaryColor}40`, overflow: "hidden",
              }}>
                <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 14, color: "#f5f0ff", lineHeight: 1.3, marginBottom: 6 }}>
                {item.title}
              </p>
              <div className="flex gap-3 flex-wrap mb-2" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                {item.rating && <span>⭐ {item.rating}</span>}
                {item.year && <span>{item.year}</span>}
                {item.episodes && <span>{item.episodes} Eps</span>}
                {item.status && (
                  <span style={{ color: item.status === "Ongoing" ? meta.primaryColor : "rgba(255,255,255,0.3)" }}>
                    {item.status === "Ongoing" ? "● Ongoing" : "✓ Completed"}
                  </span>
                )}
              </div>
              {item.genres && item.genres.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {item.genres.slice(0, 5).map((g) => (
                    <span key={g} style={{
                      fontSize: 11, padding: "2px 10px", borderRadius: 9999, fontWeight: 600,
                      background: `${meta.primaryColor}14`, color: meta.primaryColor,
                      border: `1px solid ${meta.primaryColor}28`,
                    }}>{g}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {item.synopsis && (
            <div className="px-4 pb-4 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 1.7, marginTop: 12 }} className="line-clamp-4">
                {item.synopsis}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Episode selector */}
      {!isMovie && item && (
        <div className="px-4 mt-4">

          {/* Season tabs */}
          {maxSeasons > 1 && (
            <div className="mb-4">
              <p className="mb-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, letterSpacing: "0.08em" }}>
                SEASON
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {Array.from({ length: maxSeasons }, (_, i) => i + 1).map((s) => (
                  <button key={s} onClick={() => { setSeason(s); setEpisode(1); }}
                    className="flex-shrink-0 px-4 py-2 rounded-xl font-bold transition-all active:scale-95"
                    style={{
                      fontSize: 12, fontFamily: "'Space Grotesk',sans-serif",
                      background: season === s ? `${meta.primaryColor}22` : "rgba(255,255,255,0.05)",
                      color: season === s ? meta.primaryColor : "rgba(255,255,255,0.35)",
                      border: `1px solid ${season === s ? meta.primaryColor + "55" : "rgba(255,255,255,0.07)"}`,
                      boxShadow: season === s ? `0 0 12px ${meta.glowColor}` : "none",
                    }}>
                    S{s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Episode header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="section-bar h-4" />
              <p style={{ fontSize: 14, fontWeight: 800, color: "#f5f0ff", fontFamily: "'Space Grotesk',sans-serif" }}>
                Episode
              </p>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                style={{ background: `${meta.primaryColor}20`, color: meta.primaryColor, border: `1px solid ${meta.primaryColor}35` }}>
                {episode}/{maxEpisodes}
              </span>
            </div>

            {/* Prev/Next episode */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => setEpisode((e) => Math.max(1, e - 1))} disabled={episode <= 1}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  opacity: episode <= 1 ? 0.35 : 1,
                }}>
                <ChevronLeft size={15} color={meta.primaryColor} />
              </button>
              <button onClick={() => setEpisode((e) => Math.min(maxEpisodes, e + 1))} disabled={episode >= maxEpisodes}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  opacity: episode >= maxEpisodes ? 0.35 : 1,
                }}>
                <ChevronRight size={15} color={meta.primaryColor} />
              </button>
            </div>
          </div>

          {/* Episode grid — 5 columns, proper tap targets */}
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            {allEps.map((ep) => {
              const active = episode === ep;
              return (
                <button key={ep} onClick={() => setEpisode(ep)}
                  className="flex items-center justify-center rounded-xl font-bold transition-all active:scale-90"
                  style={{
                    height: 44,
                    fontSize: 13,
                    fontFamily: "'Space Grotesk',sans-serif",
                    background: active
                      ? `linear-gradient(135deg, ${meta.primaryColor}28, ${meta.secondaryColor}1e)`
                      : "rgba(255,255,255,0.04)",
                    color: active ? meta.primaryColor : "rgba(255,255,255,0.35)",
                    border: `1px solid ${active ? meta.primaryColor + "55" : "rgba(255,255,255,0.07)"}`,
                    boxShadow: active ? `0 0 12px ${meta.glowColor}` : "none",
                  }}>
                  {ep}
                </button>
              );
            })}
          </div>

          {allEps.length >= 120 && (
            <p className="text-center mt-3" style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'Space Grotesk',sans-serif" }}>
              Menampilkan 120 episode pertama
            </p>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
