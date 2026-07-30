import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, RotateCw, Settings } from "lucide-react";
import { saveProgress, getProgress } from "@/lib/storage";

interface VideoPlayerProps {
  url: string;
  episodeId: string;
  isIframe?: boolean;
  onEnded?: () => void;
  autoPlay?: boolean;
}

export default function VideoPlayer({ url, episodeId, isIframe = false, onEnded, autoPlay }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showSpeed, setShowSpeed] = useState(false);
  const [skipIndicator, setSkipIndicator] = useState<"left" | "right" | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const showControlsRef = useRef(true);
  useEffect(() => { showControlsRef.current = showControls; }, [showControls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const saved = getProgress(episodeId);
    if (saved && saved.position > 10) {
      video.currentTime = saved.position;
    }
    if (autoPlay) video.play().catch(() => {});
  }, [episodeId, autoPlay]);

  useEffect(() => {
    saveTimer.current = setInterval(() => {
      const video = videoRef.current;
      if (video && playing && video.currentTime > 0) {
        saveProgress(episodeId, video.currentTime, video.duration || 0);
      }
    }, 10000);
    return () => { if (saveTimer.current) clearInterval(saveTimer.current); };
  }, [episodeId, playing]);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // Tap/klik area video: jika controls sedang tampil → langsung hide;
  // jika sedang hidden → tampilkan + mulai timer 3 detik.
  const handleOverlayClick = useCallback(() => {
    if (showControlsRef.current) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowControls(false);
    } else {
      resetHideTimer();
    }
  }, [resetHideTimer]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setPlaying(true); }
    else { video.pause(); setPlaying(false); }
    resetHideTimer();
  }, [resetHideTimer]);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration || 0));
    setSkipIndicator(seconds > 0 ? "right" : "left");
    setTimeout(() => setSkipIndicator(null), 700);
    resetHideTimer();
  }, [resetHideTimer]);

  const handleDoubleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    skip(x < rect.width / 2 ? -10 : 10);
  }, [skip]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video) { setCurrentTime(video.currentTime); setDuration(video.duration || 0); }
  };

  const handleEnded = () => {
    setPlaying(false);
    const video = videoRef.current;
    if (video) saveProgress(episodeId, video.currentTime, video.duration || 0);
    onEnded?.();
  };

  const fmt = (s: number) => {
    if (isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  if (isIframe || !url.includes(".mp4") && !url.includes(".m3u8") && url.includes("http")) {
    return (
      <div className="relative w-full" style={{ background: "#000", aspectRatio: "16/9" }}>
        <iframe
          src={url}
          className="w-full h-full"
          allowFullScreen
          allow="autoplay; fullscreen"
          style={{ border: "none" }}
          title="Video Player"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-xl"
      style={{ background: "#000", aspectRatio: "16/9" }}
      onMouseMove={resetHideTimer}
      onDoubleClick={handleDoubleTap}
      data-testid="video-player"
    >
      <video
        ref={videoRef}
        src={url}
        className="w-full h-full"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        playsInline
      />

      {skipIndicator && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 pointer-events-none transition-opacity ${skipIndicator === "left" ? "left-8" : "right-8"}`}
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          {skipIndicator === "left" ? <RotateCcw size={32} /> : <RotateCw size={32} />}
          <span className="text-sm font-bold">10s</span>
        </div>
      )}

      <div
        className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%)" }}
        onClick={handleOverlayClick}
      >
        <div className="p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="range" min={0} max={duration || 100} value={currentTime}
            onChange={(e) => { if (videoRef.current) videoRef.current.currentTime = +e.target.value; }}
            className="w-full h-1 rounded cursor-pointer accent-[#FF6B00]"
            data-testid="video-progress"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button onClick={togglePlay} className="text-white" data-testid="btn-play-pause">
                {playing ? <Pause size={22} /> : <Play size={22} />}
              </button>
              <button onClick={() => skip(-10)} className="text-white" data-testid="btn-rewind">
                <RotateCcw size={18} />
              </button>
              <button onClick={() => skip(10)} className="text-white" data-testid="btn-forward">
                <RotateCw size={18} />
              </button>
              <button onClick={() => { setMuted(!muted); if (videoRef.current) videoRef.current.muted = !muted; }} className="text-white" data-testid="btn-mute">
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <span className="text-white text-xs">{fmt(currentTime)} / {fmt(duration)}</span>
            </div>
            <div className="flex items-center gap-2 relative">
              <button onClick={() => setShowSpeed(!showSpeed)} className="text-white flex items-center gap-1" data-testid="btn-speed">
                <Settings size={16} />
                <span className="text-xs">{speed}x</span>
              </button>
              {showSpeed && (
                <div className="absolute bottom-8 right-0 rounded-xl overflow-hidden z-10" style={{ background: "#161625", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {SPEEDS.map((s) => (
                    <button key={s} onClick={() => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; setShowSpeed(false); }}
                      className={`block w-full px-4 py-2 text-sm text-left hover:bg-white/10 ${speed === s ? "text-[#FF6B00]" : "text-white"}`}
                      data-testid={`speed-${s}`}>
                      {s}x
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => containerRef.current?.requestFullscreen()} className="text-white" data-testid="btn-fullscreen">
                <Maximize size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
