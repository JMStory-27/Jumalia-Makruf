import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Play, Info, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { ContentCard } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";
import { gradientFromTitle, getContentUrl, getWatchUrl, truncate } from "@/lib/utils";

const AUTO_MS = 5500;

export default function HeroCarousel({ items }: { items: ContentCard[] }) {
  const [idx, setIdx] = useState(0);
  const [, navigate] = useLocation();
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [imgLoaded, setImgLoaded] = useState<Record<number, boolean>>({});

  function reset() {
    clearInterval(timer.current);
    if (items.length <= 1) return;
    timer.current = setInterval(() => setIdx(i => (i + 1) % items.length), AUTO_MS);
  }

  useEffect(() => { reset(); return () => clearInterval(timer.current); }, [items.length]);

  const cur = items[idx];
  if (!cur) return null;
  const meta = CATEGORY_META[cur.type];

  function go(dir: number) { setIdx(i => (i + dir + items.length) % items.length); reset(); }

  return (
    <div className="relative w-full overflow-hidden" style={{ height: "clamp(300px, 52vw, 540px)" }}>

      {/* Slides */}
      {items.map((item, i) => (
        <div key={item.id} className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: i === idx ? 1 : 0, zIndex: i === idx ? 1 : 0 }}>
          <div className="absolute inset-0" style={{ background: gradientFromTitle(item.title) }} />
          {item.poster && (
            <img src={item.poster} alt="" aria-hidden
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: imgLoaded[i] ? 0.28 : 0,
                filter: "blur(2px) saturate(120%) brightness(0.85)",
                transform: "scale(1.07)",
                transition: "opacity 0.6s ease",
                animation: i === idx ? "hero-pan 18s ease-in-out alternate infinite" : "none",
              }}
              onLoad={() => setImgLoaded(p => ({ ...p, [i]: true }))}
            />
          )}
          {/* Soft pink-blue gradient overlay */}
          <div className="absolute inset-0" style={{
            background: `linear-gradient(to right, ${meta.primaryColor}20 0%, transparent 55%), linear-gradient(to top, rgba(7,5,14,1) 0%, rgba(7,5,14,0.6) 40%, rgba(7,5,14,0.1) 100%)`,
          }} />
          {/* Extra subtle pink shimmer top */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to bottom, rgba(244,114,182,0.06) 0%, transparent 30%)",
            pointerEvents: "none",
          }} />
        </div>
      ))}

      {/* Scan line */}
      <div className="scan-line" style={{ zIndex: 5 }} />

      {/* Side poster */}
      <div className="absolute right-5 top-1/2 -translate-y-1/2 z-10 hidden sm:block"
        style={{ width: "min(24%, 165px)" }}>
        {cur.poster && (
          <div style={{
            borderRadius: 16,
            border: `2px solid ${meta.primaryColor}`,
            boxShadow: `0 0 24px ${meta.glowColor}, 0 0 60px ${meta.glowColor}44, inset 0 0 20px rgba(0,0,0,0.3)`,
            overflow: "hidden",
            aspectRatio: "2/3",
          }}>
            <img src={cur.poster} alt={cur.title} className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end px-5 pb-9 sm:px-8" style={{ maxWidth: "64%" }}>
        {/* Category badge */}
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold mb-3 w-fit"
          style={{
            background: `${meta.primaryColor}18`,
            border: `1px solid ${meta.primaryColor}45`,
            color: meta.primaryColor,
            boxShadow: `0 0 12px ${meta.glowColor}`,
            fontFamily: "'Space Grotesk',sans-serif",
          }}>
          {meta.emoji} {meta.label.toUpperCase()}
          {cur.status === "Ongoing" && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
        </span>

        {/* Title */}
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: "clamp(18px, 3.8vw, 34px)",
          fontWeight: 700,
          lineHeight: 1.2,
          color: "#fff",
          textShadow: "0 2px 20px rgba(0,0,0,0.8)",
          marginBottom: 8,
        }}>
          {cur.title}
        </h1>

        {/* Meta */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {cur.rating && (
            <span className="flex items-center gap-1 text-sm font-bold" style={{ color: "#FBBF24" }}>
              <Star size={11} fill="#FBBF24" color="#FBBF24" />{cur.rating}
            </span>
          )}
          {cur.year && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{cur.year}</span>}
          {cur.episodes && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{cur.episodes} Ep</span>}
          {cur.genres?.slice(0, 2).map(g => (
            <span key={g} style={{
              fontSize: 9, padding: "2px 8px", borderRadius: 9999,
              background: "rgba(244,114,182,0.08)", color: "rgba(244,114,182,0.6)",
              border: "1px solid rgba(244,114,182,0.15)",
            }}>
              {g}
            </span>
          ))}
        </div>

        {/* Synopsis */}
        {cur.synopsis && (
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, lineHeight: 1.6, marginBottom: 16 }}
            className="hidden sm:block line-clamp-2">
            {truncate(cur.synopsis, 120)}
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-2.5">
          <button onClick={() => navigate(getWatchUrl(cur))}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm active:scale-95 transition-transform"
            style={{
              background: `linear-gradient(135deg, ${meta.primaryColor}, ${meta.secondaryColor})`,
              color: "#fff",
              boxShadow: `0 4px 20px ${meta.glowColor}, 0 2px 8px rgba(0,0,0,0.3)`,
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
            <Play size={15} fill="white" /> Tonton
          </button>
          <button onClick={() => navigate(getContentUrl(cur))}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm active:scale-95 transition-transform glass"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              border: "1px solid rgba(244,114,182,0.18)",
            }}>
            <Info size={15} /> Detail
          </button>
        </div>
      </div>

      {/* Nav arrows */}
      {items.length > 1 && (
        <>
          <button onClick={() => go(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90"
            style={{
              background: "rgba(7,5,14,0.65)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(244,114,182,0.18)",
            }}>
            <ChevronLeft size={17} color="rgba(244,114,182,0.9)" />
          </button>
          <button onClick={() => go(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90"
            style={{
              background: "rgba(7,5,14,0.65)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(96,165,250,0.18)",
            }}>
            <ChevronRight size={17} color="rgba(96,165,250,0.9)" />
          </button>
        </>
      )}

      {/* Dots */}
      {items.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 items-center">
          {items.slice(0, 8).map((_, i) => (
            <button key={i} onClick={() => { setIdx(i); reset(); }}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === idx ? 20 : 5,
                height: 5,
                background: i === idx
                  ? "linear-gradient(90deg, #F472B6, #A78BFA, #60A5FA)"
                  : "rgba(255,255,255,0.16)",
                boxShadow: i === idx ? "0 0 8px rgba(244,114,182,0.5)" : "none",
              }} />
          ))}
        </div>
      )}
    </div>
  );
}
