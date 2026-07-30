import { useEffect } from "react";

const WA_NUMBER = "6285824162280";
const WA_LINK = `https://wa.me/${WA_NUMBER}`;

const KEYFRAMES = `
@keyframes ob-rainbow-shift {
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}
@keyframes ob-halo-pulse {
  0%,100% { box-shadow: 0 0 10px 2px rgba(255,165,0,0.25), 0 0 20px 4px rgba(255,215,0,0.10); }
  50%      { box-shadow: 0 0 18px 5px rgba(255,165,0,0.45), 0 0 36px 8px rgba(255,215,0,0.22); }
}
@keyframes ob-wa-pulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(37,211,102,0.5); }
  60%      { box-shadow: 0 0 0 4px rgba(37,211,102,0); }
}
@keyframes ob-star-twinkle {
  0%,100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.6); opacity: 0.6; }
}
@keyframes ob-crown-bounce {
  0%,100% { transform: translateY(0); }
  45%      { transform: translateY(-3px); filter: drop-shadow(0 0 10px #FFD700); }
}
@keyframes ob-particle-rise {
  0%   { transform: translateY(0) translateX(0); opacity: 0.8; }
  100% { transform: translateY(-30px) translateX(var(--dx)); opacity: 0; }
}
`;

const PARTICLES = [
  { color: "#FFD700", size: 3, left: "15%", delay: 0,   dur: 2.4, dx: "-5px" },
  { color: "#FF6B9D", size: 2, left: "45%", delay: 0.8, dur: 2.8, dx: "4px"  },
  { color: "#60A5FA", size: 2, left: "75%", delay: 1.6, dur: 2.6, dx: "-4px" },
  { color: "#34D399", size: 2, left: "88%", delay: 0.4, dur: 3.0, dx: "5px"  },
];

export default function OwnerBadge() {
  useEffect(() => {
    if (!document.getElementById("ob-kf")) {
      const s = document.createElement("style");
      s.id = "ob-kf";
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
    }
  }, []);

  return (
    <div style={{ padding: "6px 16px 2px", position: "relative", zIndex: 1 }}>
      {/* Rainbow border (static gradient, no spin) */}
      <div style={{
        borderRadius: 14,
        padding: "1.5px",
        background: "linear-gradient(90deg, #FFD700, #FF6B9D, #A78BFA, #60A5FA, #34D399, #FFD700)",
        backgroundSize: "200% 100%",
        animation: "ob-rainbow-shift 3s linear infinite",
      }}>
        {/* Inner card */}
        <div style={{
          borderRadius: 13,
          background: "linear-gradient(135deg, #0f0a1e 0%, #130d22 50%, #0a0815 100%)",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          animation: "ob-halo-pulse 3s ease-in-out infinite",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Particles */}
          {PARTICLES.map((p, i) => (
            <span key={i} aria-hidden style={{
              position: "absolute", bottom: "55%", left: p.left,
              width: p.size, height: p.size, borderRadius: "50%",
              background: p.color, pointerEvents: "none",
              animation: `ob-particle-rise ${p.dur}s ${p.delay}s ease-out infinite`,
              "--dx": p.dx,
            } as React.CSSProperties} />
          ))}

          {/* Crown */}
          <div style={{
            fontSize: 22, flexShrink: 0, lineHeight: 1,
            animation: "ob-crown-bounce 2s ease-in-out infinite",
          }}>
            👑
          </div>

          {/* Name + label */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 7.5, fontWeight: 700, letterSpacing: "0.13em",
              color: "rgba(255,215,0,0.5)", margin: "0 0 1px",
              textTransform: "uppercase",
            }}>
              APLIKASI INI BUATAN
            </p>
            <p style={{
              fontSize: 14, fontWeight: 900, margin: 0, lineHeight: 1.1,
              background: "linear-gradient(90deg, #FFD700, #FF6B9D, #A78BFA, #60A5FA, #34D399, #FFD700)",
              backgroundSize: "200% 100%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "ob-rainbow-shift 2.5s linear infinite",
            }}>
              KING LAWRENZ
            </p>
          </div>

          {/* WA button */}
          <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{
            display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
            background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)",
            borderRadius: 99, padding: "4px 10px", textDecoration: "none",
            animation: "ob-wa-pulse 2s ease-in-out infinite",
          }}>
            <span style={{ fontSize: 11 }}>📱</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#25D366" }}>
              +{WA_NUMBER}
            </span>
          </a>

          {/* OWNER */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 3 }}>
              {[0, 0.35, 0.7].map((d, i) => (
                <span key={i} style={{
                  fontSize: 8, color: "#FFD700", display: "inline-block",
                  animation: `ob-star-twinkle 1.8s ${d}s ease-in-out infinite`,
                }}>★</span>
              ))}
            </div>
            <div style={{
              background: "linear-gradient(135deg, #92670a, #FFD700, #FFA500)",
              borderRadius: 99, padding: "2px 10px",
              fontSize: 8, fontWeight: 900, color: "#1a0800",
              letterSpacing: "0.18em",
            }}>
              OWNER
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
