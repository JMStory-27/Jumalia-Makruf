import { useLocation, Link } from "wouter";

const NAV_ITEMS = [
  { path: "/",        label: "Beranda", emoji: "🏠" },
  { path: "/search",  label: "Cari",    emoji: "🔍" },
  { path: "/nobar",   label: "Nobar",   emoji: "🍿", highlight: true },
  { path: "/history", label: "Riwayat", emoji: "📋" },
  { path: "/schedule",label: "Jadwal",  emoji: "📅" },
  { path: "/watchlist",label: "Daftar", emoji: "📚" },
];

export default function BottomNav() {
  const [location] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around"
      style={{
        background: "rgba(5,5,16,0.97)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        minHeight: "60px",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.6), 0 -1px 0 rgba(96,165,250,0.06)",
      }}
    >
      {NAV_ITEMS.map(({ path, label, emoji, highlight }) => {
        const isActive = path === "/" ? location === "/" : location.startsWith(path);
        return (
          <Link
            key={path}
            href={path}
            data-testid={`nav-${label.toLowerCase()}`}
            className="flex flex-col items-center justify-center gap-0.5 px-1 py-2 flex-1 relative overflow-hidden"
            style={{ minWidth: 0 }}
          >
            {/* Active background pill */}
            {isActive && (
              <span
                className="absolute inset-x-1 top-1.5 bottom-1.5 rounded-2xl"
                style={{
                  background: highlight
                    ? "linear-gradient(135deg, rgba(255,107,0,0.18), rgba(255,68,68,0.12))"
                    : "linear-gradient(135deg, rgba(96,165,250,0.14), rgba(167,139,250,0.10))",
                  border: highlight
                    ? "1px solid rgba(255,107,0,0.22)"
                    : "1px solid rgba(96,165,250,0.18)",
                  animation: "scale-in 0.25s ease both",
                }}
              />
            )}

            {/* Active top indicator */}
            {isActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full"
                style={{
                  width: "24px",
                  background: highlight
                    ? "linear-gradient(90deg, #FF6B00, #FF4444)"
                    : "linear-gradient(90deg, #60A5FA, #A78BFA)",
                  boxShadow: highlight
                    ? "0 0 10px rgba(255,107,0,0.9)"
                    : "0 0 10px rgba(96,165,250,0.9)",
                  animation: "nav-indicator-in 0.25s ease both",
                }}
              />
            )}

            {/* Emoji */}
            <span
              className="text-lg relative z-10"
              style={{
                filter: isActive
                  ? highlight
                    ? "drop-shadow(0 0 7px rgba(255,107,0,0.9))"
                    : "drop-shadow(0 0 7px rgba(96,165,250,0.9))"
                  : "grayscale(0.3) opacity(0.6)",
                transform: isActive ? "scale(1.18) translateY(-1px)" : "scale(1)",
                transition: "transform 0.25s cubic-bezier(.16,1,.3,1), filter 0.25s ease",
              }}
            >
              {emoji}
            </span>

            {/* Label */}
            <span
              className="text-[9px] font-bold tracking-wide relative z-10"
              style={{
                color: isActive
                  ? highlight ? "#FF6B00" : "#60A5FA"
                  : "#374151",
                textShadow: isActive
                  ? highlight ? "0 0 10px rgba(255,107,0,0.5)" : "0 0 10px rgba(96,165,250,0.5)"
                  : "none",
                transition: "color 0.2s ease",
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
