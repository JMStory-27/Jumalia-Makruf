import { useLocation } from "wouter";
import { Home, Search, Bookmark, Film, Tv2 } from "lucide-react";

const TABS = [
  { path: "/",                 label: "Beranda",  Icon: Home,     emoji: null,  color: "#F472B6" },
  { path: "/category/dracin", label: "Dracin",   Icon: null,     emoji: "🐉",  color: "#FB7185" },
  { path: "/category/drakor", label: "Drakor",   Icon: null,     emoji: "🇰🇷",  color: "#F472B6" },
  { path: "/category/film",   label: "Film",     Icon: Film,     emoji: null,  color: "#60A5FA" },
  { path: "/search",          label: "Cari",     Icon: Search,   emoji: null,  color: "#A78BFA" },
] as const;

export default function BottomNav() {
  const [loc, navigate] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "rgba(7,5,14,0.97)",
        backdropFilter: "blur(32px) saturate(200%)",
        borderTop: "1px solid rgba(244,114,182,0.08)",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
      }}>

      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent 0%, rgba(244,114,182,0.3) 25%, rgba(167,139,250,0.25) 50%, rgba(96,165,250,0.3) 75%, transparent 100%)",
      }} />

      <div className="flex items-stretch justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 6px)", height: 64 }}>
        {TABS.map(tab => {
          const active = loc === tab.path || (tab.path !== "/" && loc.startsWith(tab.path));
          const color = active ? tab.color : "rgba(255,255,255,0.3)";
          return (
            <button key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center justify-center gap-1 flex-1 transition-all active:scale-90"
              style={{ minWidth: 0, position: "relative" }}>

              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2"
                  style={{
                    width: 32, height: 3, borderRadius: "0 0 4px 4px",
                    background: `linear-gradient(90deg, ${tab.color}aa, ${tab.color}, ${tab.color}aa)`,
                    boxShadow: `0 0 8px ${tab.color}`,
                  }} />
              )}

              {tab.emoji
                ? <span style={{
                    fontSize: active ? 22 : 20,
                    transition: "all 0.2s",
                    filter: active ? `drop-shadow(0 0 6px ${tab.color})` : "grayscale(0.3) opacity(0.65)",
                  }}>{tab.emoji}</span>
                : tab.Icon && <tab.Icon size={active ? 22 : 20} color={color}
                    style={{
                      transition: "all 0.2s",
                      filter: active ? `drop-shadow(0 0 5px ${tab.color})` : "none",
                    }} />
              }
              <span style={{
                fontSize: 10, fontWeight: active ? 800 : 500, color,
                fontFamily: "'Space Grotesk', sans-serif",
                letterSpacing: "0.02em",
                transition: "all 0.2s",
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
