import { useLocation } from "wouter";
import { Search, Bookmark, Bell, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";

export default function TopNavBar() {
  const [, navigate] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(7,5,14,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(24px) saturate(180%)" : "none",
        borderBottom: scrolled ? "1px solid rgba(244,114,182,0.08)" : "none",
        boxShadow: scrolled ? "0 4px 24px rgba(244,114,182,0.06)" : "none",
      }}>
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">

        {/* Logo */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2 group">
          <div className="relative w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #F472B6 0%, #A78BFA 50%, #60A5FA 100%)",
              boxShadow: "0 0 14px rgba(244,114,182,0.5)",
            }}>
            <Sparkles size={14} color="#fff" fill="#fff" />
          </div>
          <span style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 15,
            fontWeight: 900,
            background: "linear-gradient(90deg, #F472B6, #A78BFA, #60A5FA)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "0.04em",
          }}>
            LawrenzVerse
          </span>
        </button>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <button className="relative w-8 h-8 rounded-full glass flex items-center justify-center"
            style={{ border: "1px solid rgba(244,114,182,0.12)" }}>
            <Bell size={14} color="rgba(244,114,182,0.75)" />
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold"
              style={{
                background: "linear-gradient(135deg,#F472B6,#EC4899)",
                color: "#fff",
                boxShadow: "0 0 8px rgba(244,114,182,0.6)",
              }}>
              5
            </span>
          </button>

          {/* Watchlist */}
          <button onClick={() => navigate("/watchlist")}
            className="w-8 h-8 rounded-full glass flex items-center justify-center"
            style={{ border: "1px solid rgba(96,165,250,0.12)" }}>
            <Bookmark size={14} color="rgba(96,165,250,0.75)" />
          </button>

          {/* Search bar */}
          <button onClick={() => navigate("/search")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{
              background: "rgba(244,114,182,0.06)",
              border: "1px solid rgba(244,114,182,0.14)",
              minWidth: 90,
            }}>
            <Search size={12} color="rgba(244,114,182,0.5)" />
            <span style={{ fontSize: 11, color: "rgba(244,114,182,0.4)", fontFamily: "'Space Grotesk',sans-serif" }}>Cari...</span>
          </button>
        </div>
      </div>

      {/* Pink-blue gradient hairline at bottom when scrolled */}
      {scrolled && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(244,114,182,0.3), rgba(96,165,250,0.3), transparent)",
        }} />
      )}
    </header>
  );
}
