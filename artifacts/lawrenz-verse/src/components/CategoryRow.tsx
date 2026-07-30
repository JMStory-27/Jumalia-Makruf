import { useRef } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ChevronLeft } from "lucide-react";
import ContentCard from "./ContentCard";
import type { ContentCard as CC, ContentType } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";

interface Props {
  title: string;
  emoji?: string;
  items: CC[];
  type: ContentType;
  top10?: boolean;
  viewAllPath?: string;
  badge?: string;
}

export default function CategoryRow({ title, emoji, items, type, top10, viewAllPath, badge }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const meta = CATEGORY_META[type];

  function scroll(dir: number) {
    rowRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });
  }

  if (!items.length) return null;

  return (
    <section className="relative px-4 sm:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Gradient bar */}
          <div style={{
            width: 4, height: 22, borderRadius: 9999, flexShrink: 0,
            background: `linear-gradient(to bottom, ${meta.primaryColor}, ${meta.secondaryColor})`,
            boxShadow: `0 0 8px ${meta.glowColor}`,
          }} />
          <h2 style={{
            fontFamily: "'Space Grotesk',sans-serif",
            fontWeight: 700,
            fontSize: "clamp(13px,3.5vw,15px)",
            color: "#f5f0ff",
          }}>
            {emoji && <span className="mr-1">{emoji}</span>}{title}
          </h2>
          {badge && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold animate-badge-pop"
              style={{
                background: `${meta.primaryColor}18`,
                color: meta.primaryColor,
                border: `1px solid ${meta.primaryColor}35`,
              }}>
              {badge}
            </span>
          )}
          {top10 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
              style={{
                background: "rgba(251,191,36,0.12)",
                color: "#FBBF24",
                border: "1px solid rgba(251,191,36,0.25)",
              }}>
              TOP 10
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => scroll(-1)}
            className="w-7 h-7 rounded-full flex items-center justify-center hidden sm:flex transition-all hover:scale-110"
            style={{ background: "rgba(244,114,182,0.08)", border: "1px solid rgba(244,114,182,0.15)" }}>
            <ChevronLeft size={13} color="rgba(244,114,182,0.7)" />
          </button>
          <button onClick={() => scroll(1)}
            className="w-7 h-7 rounded-full flex items-center justify-center hidden sm:flex transition-all hover:scale-110"
            style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.15)" }}>
            <ChevronRight size={13} color="rgba(96,165,250,0.7)" />
          </button>
          {viewAllPath && (
            <button onClick={() => navigate(viewAllPath)}
              className="flex items-center gap-0.5 text-xs font-bold transition-all hover:opacity-80"
              style={{ color: meta.primaryColor, fontFamily: "'Space Grotesk',sans-serif" }}>
              Semua <ChevronRight size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Row */}
      <div ref={rowRef}
        className="flex gap-3 overflow-x-auto hide-scrollbar pb-2"
        style={{ paddingLeft: top10 ? "20px" : "0" }}>
        {items.map((card, i) => (
          <ContentCard key={card.id} card={card} rank={top10 ? i + 1 : undefined} />
        ))}
      </div>
    </section>
  );
}
