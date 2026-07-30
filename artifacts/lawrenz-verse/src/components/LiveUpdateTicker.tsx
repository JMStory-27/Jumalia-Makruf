import type { ContentCard } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";

export default function LiveUpdateTicker({ items }: { items: ContentCard[] }) {
  if (!items.length) return null;
  const doubled = [...items, ...items];

  return (
    <div className="relative overflow-hidden py-2"
      style={{
        background: "rgba(7,5,14,0.88)",
        borderTop: "1px solid rgba(244,114,182,0.08)",
        borderBottom: "1px solid rgba(96,165,250,0.08)",
      }}>
      {/* Edge fades */}
      <div className="absolute left-0 top-0 bottom-0 w-14 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to right, rgba(7,5,14,1), transparent)" }} />
      <div className="absolute right-0 top-0 bottom-0 w-14 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to left, rgba(7,5,14,1), transparent)" }} />

      {/* LIVE badge */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-full"
        style={{
          background: "rgba(244,114,182,0.1)",
          border: "1px solid rgba(244,114,182,0.3)",
        }}>
        <span className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "#F472B6", boxShadow: "0 0 5px #F472B6" }} />
        <span style={{ fontSize: 7, fontWeight: 800, color: "#F472B6", fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.12em" }}>LIVE</span>
      </div>

      {/* Scrolling content */}
      <div className="flex animate-ticker gap-5 pl-16" style={{ width: "max-content" }}>
        {doubled.map((item, i) => {
          const meta = CATEGORY_META[item.type];
          return (
            <div key={`${item.id}-${i}`} className="flex items-center gap-2 flex-shrink-0">
              <span style={{ fontSize: 10 }}>{meta.emoji}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(245,240,255,0.8)", fontFamily: "'Space Grotesk',sans-serif", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              {item.episodes && (
                <span style={{
                  fontSize: 8, padding: "1px 6px", borderRadius: 9999, fontWeight: 700,
                  background: `${meta.primaryColor}18`, color: meta.primaryColor,
                  border: `1px solid ${meta.primaryColor}30`,
                }}>
                  EP {item.episodes}
                </span>
              )}
              <span style={{ color: "rgba(244,114,182,0.15)", marginLeft: 4 }}>✦</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
