import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Bookmark, BookmarkCheck, Play, Star } from "lucide-react";
import type { ContentCard as CC, ContentType } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";
import { hashId, gradientFromTitle, initials, getContentUrl } from "@/lib/utils";
import { toggleWatchlist, isInWatchlist } from "@/lib/storage";

const BORDER_ANIMS: Record<ContentType, string> = {
  dracin: "dracin-pulse",
  drakor: "drakor-pulse",
  film:   "film-pulse",
  series: "series-pulse",
};

const DELAYS = [0, 0.4, 0.8, 1.2, 1.6, 0.2, 0.6, 1.0, 1.4, 0.3, 0.7, 1.1, 1.5, 0.5, 0.9, 1.3, 0.1, 0.35, 0.75, 1.25];
const WIDTHS = [1.5, 2, 1.8, 2.2, 1.6, 1.9, 2.1, 1.7, 2.3, 1.4, 2.0, 1.6, 2.4, 1.8, 2.2, 1.5, 2.1, 1.7, 2.3, 1.9];

function PosterImage({ title, poster }: { title: string; poster: string }) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  const grad = gradientFromTitle(title);
  const ini = initials(title);

  return (
    <div className="absolute inset-0" style={{ background: grad }}>
      <div className="absolute inset-0 flex items-center justify-center opacity-15">
        <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: "clamp(14px,2.5vw,22px)", fontWeight: 900, color: "#fff" }}>{ini}</span>
      </div>
      {poster && !err && (
        <img src={poster} alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease" }}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
        />
      )}
    </div>
  );
}

interface Props {
  card: CC;
  rank?: number;
  compact?: boolean;
}

export default function ContentCard({ card, rank, compact }: Props) {
  const [, navigate] = useLocation();
  const [bookmarked, setBookmarked] = useState(false);
  const [hovered, setHovered] = useState(false);
  const meta = CATEGORY_META[card.type];
  const vi = hashId(card.id) % 20;
  const bw = compact ? 1.5 : WIDTHS[vi];
  const delay = `${DELAYS[vi]}s`;
  const dur = `${2.2 + (vi % 5) * 0.3}s`;

  useEffect(() => { setBookmarked(isInWatchlist(card.id)); }, [card.id]);

  const w = compact ? "w-[90px]" : "w-[128px] sm:w-[144px]";

  return (
    <div className={`relative flex-shrink-0 cursor-pointer ${w} group`}
      onClick={() => navigate(getContentUrl(card))}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>

      {/* Top-10 rank */}
      {rank !== undefined && (
        <div className="absolute -left-4 bottom-10 z-10 pointer-events-none">
          <span className="top10-num" style={{ color: meta.primaryColor }}>{rank}</span>
        </div>
      )}

      {/* Border wrapper */}
      <div style={{
        borderRadius: 14,
        border: `${bw}px solid ${meta.primaryColor}`,
        animation: `${BORDER_ANIMS[card.type]} ${dur} ease-in-out ${delay} infinite`,
        transform: hovered ? "scale(1.05) translateY(-2px)" : "scale(1)",
        transition: "transform 0.22s ease",
      }}>
        {/* Corner spinning dots (every 4th card) */}
        {vi % 4 === 0 && (() => {
          const ds = compact ? 4 : 5;
          const base: React.CSSProperties = {
            position: "absolute", width: ds, height: ds, borderRadius: "50%",
            background: meta.primaryColor,
            boxShadow: `0 0 6px ${meta.primaryColor}, 0 0 12px ${meta.primaryColor}`,
            zIndex: 5, pointerEvents: "none",
          };
          return (
            <>
              <span style={{ ...base, top: -ds/2, left: -ds/2, animation: `corner-cw ${3+vi*0.3}s linear infinite` }} />
              <span style={{ ...base, bottom: -ds/2, right: -ds/2, animation: `corner-ccw ${3+vi*0.3}s linear infinite` }} />
            </>
          );
        })()}

        {/* Poster */}
        <div className="relative overflow-hidden rounded-xl"
          style={{
            aspectRatio: "2/3",
            boxShadow: hovered
              ? `0 10px 32px ${meta.glowColor}, 0 4px 16px rgba(0,0,0,0.5)`
              : "0 4px 14px rgba(0,0,0,0.45)",
            transition: "box-shadow 0.22s",
          }}>
          <PosterImage title={card.title} poster={card.poster} />

          {/* Gradient overlay */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(7,5,14,0.97) 0%, transparent 55%)" }} />
          {/* Soft pink shimmer top-left */}
          <div className="absolute inset-0" style={{
            background: `radial-gradient(ellipse at 10% 10%, ${meta.primaryColor}08 0%, transparent 55%)`,
            pointerEvents: "none",
          }} />

          {/* Scan line on hover */}
          {hovered && <div className="scan-line" />}

          {/* Category badge */}
          <span className="absolute top-1.5 left-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
            style={{
              background: `${meta.primaryColor}18`,
              color: meta.primaryColor,
              border: `1px solid ${meta.primaryColor}35`,
            }}>
            {meta.emoji}
          </span>

          {/* Rating */}
          {card.rating && (
            <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", color: "#FBBF24" }}>
              <Star size={7} fill="#FBBF24" color="#FBBF24" /> {card.rating}
            </span>
          )}

          {/* Episodes */}
          {card.episodes && (
            <span className="absolute bottom-7 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", color: "#fff" }}>
              {card.episodes}{card.type !== "film" ? " Ep" : ""}
            </span>
          )}

          {/* Status */}
          {card.status && (
            <span className="absolute bottom-1.5 left-1.5 text-[8px] px-1.5 py-0.5 rounded-full font-bold"
              style={{
                background: card.status === "Ongoing" ? `${meta.primaryColor}18` : "rgba(255,255,255,0.05)",
                color: card.status === "Ongoing" ? meta.primaryColor : "rgba(255,255,255,0.3)",
              }}>
              {card.status === "Ongoing" ? "● ON" : "✓ END"}
            </span>
          )}

          {/* Play on hover */}
          {hovered && (
            <div className="absolute inset-0 flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.28)" }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${meta.primaryColor}, ${meta.secondaryColor})`,
                  boxShadow: `0 0 24px ${meta.glowColor}`,
                }}>
                <Play size={18} fill="white" color="white" style={{ marginLeft: 2 }} />
              </div>
            </div>
          )}

          {/* Bookmark btn */}
          <button onClick={e => { e.stopPropagation(); setBookmarked(toggleWatchlist(card)); }}
            className="absolute bottom-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
            {bookmarked
              ? <BookmarkCheck size={11} color={meta.primaryColor} fill={meta.primaryColor} />
              : <Bookmark size={11} color="rgba(255,255,255,0.7)" />}
          </button>
        </div>
      </div>

      {/* Title */}
      <p className="mt-1.5 text-[11px] font-semibold line-clamp-2 leading-tight px-0.5"
        style={{ color: "rgba(245,240,255,0.88)" }}>
        {card.title}
      </p>
      {card.year && (
        <p className="text-[9px] px-0.5 mt-0.5" style={{ color: "rgba(167,139,250,0.45)" }}>{card.year}</p>
      )}
    </div>
  );
}
