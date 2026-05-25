import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Play, ChevronLeft, ChevronRight } from "lucide-react";
import type { AnimeCard } from "@/lib/api";
import { titlePlaceholder } from "@/lib/utils";
import { usePoster } from "@/lib/usePoster";
import { useBanner } from "@/lib/useBanner";

const AUTO_ROTATE_MS = 5000;
const DOT_LIMIT = 8;

function HeroSlide({ anime }: { anime: AnimeCard }) {
  const malPoster = usePoster(anime.title);
  const bannerImg = useBanner(anime.title);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [grad] = titlePlaceholder(anime.title);

  const displayImg = bannerImg ?? malPoster;
  const isBanner = !!bannerImg;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: grad }} />
      {displayImg && (
        <img
          src={displayImg}
          alt={anime.title}
          className="absolute inset-0 w-full h-full"
          style={{
            opacity: imgLoaded ? 1 : 0,
            transition: "opacity 0.4s ease",
            objectFit: "cover",
            objectPosition: isBanner ? "center 30%" : "center 20%",
          }}
          onLoad={() => setImgLoaded(true)}
        />
      )}
    </div>
  );
}

export default function HeroCarousel({ items }: { items: AnimeCard[] }) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const list = items;

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (list.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % list.length);
    }, AUTO_ROTATE_MS);
  };

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [list.length]);

  const goTo = (i: number) => {
    setIdx((i + list.length) % list.length);
    resetTimer();
  };

  const prev = () => goTo(idx - 1);
  const next = () => goTo(idx + 1);

  if (!list.length) return null;
  const current = list[idx];

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "280px" }}
    >
      {/* Active slide */}
      <HeroSlide key={current.animeId} anime={current} />

      {/* Gradient overlays */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(to top, rgba(5,5,18,1) 0%, rgba(5,5,18,0.5) 45%, transparent 100%)"
      }} />
      <div className="absolute inset-0" style={{
        background: "linear-gradient(to right, rgba(5,5,18,0.65) 0%, transparent 60%)"
      }} />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 z-10">
        <div className="flex items-center gap-2 mb-2">
          {current.episodes && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full"
              style={{
                background: "rgba(255,107,0,0.2)", color: "#FF6B00",
                border: "1px solid rgba(255,107,0,0.4)", backdropFilter: "blur(8px)",
              }}>
              🔥 Ep {current.episodes}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(52,211,153,0.15)", color: "#34D399",
              border: "1px solid rgba(52,211,153,0.3)", backdropFilter: "blur(8px)",
            }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400"
              style={{ animation: "live-dot 1.2s ease-in-out infinite" }} />
            ONGOING
          </span>
          {current.releaseDay && (
            <span className="text-[10px]" style={{ color: "#94A3B8" }}>{current.releaseDay}</span>
          )}
        </div>

        <h2
          className="font-black text-lg leading-tight line-clamp-2 mb-3"
          style={{ color: "#F8FAFC", textShadow: "0 2px 16px rgba(0,0,0,0.9)" }}
        >
          {current.title}
        </h2>

        <div className="flex items-center gap-2">
          <Link href={`/anime/${current.animeId}`}>
            <button
              className="flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-sm card-press"
              style={{
                background: "linear-gradient(135deg, #FF6B00, #FF4444)",
                color: "#fff", boxShadow: "0 4px 20px rgba(255,107,0,0.5)",
                letterSpacing: "0.02em",
              }}
              data-testid="hero-watch-btn"
            >
              <Play size={13} fill="white" />
              Tonton
            </button>
          </Link>
          <button onClick={prev}
            className="w-9 h-9 flex items-center justify-center rounded-full card-press"
            style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <ChevronLeft size={16} color="white" />
          </button>
          <button onClick={next}
            className="w-9 h-9 flex items-center justify-center rounded-full card-press"
            style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <ChevronRight size={16} color="white" />
          </button>
          <span className="text-[10px] font-bold ml-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {idx + 1}/{list.length}
          </span>
        </div>
      </div>


      {/* Dot indicators (max DOT_LIMIT dots) */}
      {list.length > 1 && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-10">
          {(() => {
            const total = list.length;
            const half = Math.floor(DOT_LIMIT / 2);
            let start = Math.max(0, idx - half);
            const end = Math.min(total, start + DOT_LIMIT);
            start = Math.max(0, end - DOT_LIMIT);
            return Array.from({ length: end - start }, (_, i) => {
              const realIdx = start + i;
              const isActive = realIdx === idx;
              return (
                <button
                  key={realIdx}
                  onClick={() => goTo(realIdx)}
                  className="rounded-full transition-all duration-200"
                  style={{
                    width: "5px",
                    height: isActive ? "20px" : "5px",
                    background: isActive
                      ? "linear-gradient(180deg, #60A5FA, #A78BFA)"
                      : "rgba(255,255,255,0.2)",
                    boxShadow: isActive ? "0 0 8px rgba(96,165,250,0.7)" : "none",
                  }}
                />
              );
            });
          })()}
          {list.length > DOT_LIMIT && (
            <span className="text-[8px] text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
              {list.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
