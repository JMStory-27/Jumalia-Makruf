import { useEffect, useState } from "react";

const RANK_COLORS: Record<string, string> = {
  F: "#6E6E90", E: "#94A3B8", D: "#5865F2", C: "#57F287",
  B: "#FEE75C", A: "#EB459E", S: "#FF6B00", SS: "#FF4444", SSS: "#FF0000",
};

const RANK_LABELS: Record<string, string> = {
  F: "Pemula", E: "Rookie", D: "Bronze", C: "Silver",
  B: "Gold", A: "Platinum", S: "Diamond", SS: "Master", SSS: "Grand Master",
};

interface Props {
  fromRank: string;
  toRank: string;
  onDone: () => void;
}

const OVERLAY_CSS = `
@keyframes rank-ray { 0%{opacity:0;transform:translate(-50%,-100%) rotate(var(--r)) scaleY(0)} 40%{opacity:.4} 100%{opacity:0;transform:translate(-50%,-100%) rotate(var(--r)) scaleY(1)} }
@keyframes rank-ring { 0%{transform:scale(0);opacity:.6} 100%{transform:scale(1.6);opacity:0} }
@keyframes rank-pulse { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
@keyframes rank-spark { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(var(--sx),var(--sy)) scale(0);opacity:0} }
`;

let styleInjected = false;
function injectStyles() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = OVERLAY_CSS;
  document.head.appendChild(el);
}

export default function RankUpOverlay({ fromRank, toRank, onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "show" | "out">("in");
  const color = RANK_COLORS[toRank] ?? "#FF6B00";
  const label = RANK_LABELS[toRank] ?? toRank;

  useEffect(() => {
    injectStyles();
    const t1 = setTimeout(() => setPhase("show"), 200);
    const t2 = setTimeout(() => setPhase("out"), 3200);
    const t3 = setTimeout(() => onDone(), 3800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const rays = Array.from({ length: 16 });
  const sparks = Array.from({ length: 24 });

  return (
    <div
      onClick={() => { setPhase("out"); setTimeout(onDone, 500); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: phase === "show" ? "rgba(0,0,0,0.88)" : "rgba(0,0,0,0)",
        transition: "background 0.4s ease",
        cursor: "pointer",
      }}
    >
      {/* Light rays */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {phase === "show" && rays.map((_, i) => (
          <div key={i} style={{
            position: "absolute", top: "50%", left: "50%",
            width: "3px", height: "55vh",
            background: `linear-gradient(to top, ${color}88, transparent)`,
            transformOrigin: "bottom center",
            ["--r" as string]: `${i * (360 / rays.length)}deg`,
            transform: `translate(-50%, -100%) rotate(${i * (360 / rays.length)}deg)`,
            animation: `rank-ray 1.2s ${i * 0.04}s ease-out both`,
          }} />
        ))}
      </div>

      {/* Sparks */}
      {phase === "show" && sparks.map((_, i) => {
        const angle = (i / sparks.length) * Math.PI * 2;
        const dist = 80 + Math.random() * 120;
        return (
          <div key={i} style={{
            position: "absolute", top: "50%", left: "50%",
            width: 6, height: 6, borderRadius: "50%",
            background: color,
            boxShadow: `0 0 8px ${color}`,
            ["--sx" as string]: `${Math.cos(angle) * dist}px`,
            ["--sy" as string]: `${Math.sin(angle) * dist}px`,
            animation: `rank-spark 0.9s ${i * 0.03}s ease-out both`,
          }} />
        );
      })}

      {/* Main card */}
      <div style={{
        position: "relative", zIndex: 1, textAlign: "center",
        opacity: phase === "show" ? 1 : 0,
        transform: phase === "show" ? "scale(1)" : phase === "in" ? "scale(0.4)" : "scale(1.1)",
        transition: "all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        {/* Outer rings */}
        <div style={{
          position: "absolute", inset: -80, borderRadius: "50%",
          border: `2px solid ${color}66`,
          animation: phase === "show" ? "rank-ring 1.2s ease-out both" : "none",
        }} />
        <div style={{
          position: "absolute", inset: -100, borderRadius: "50%",
          border: `1px solid ${color}33`,
          animation: phase === "show" ? "rank-ring 1.4s 0.15s ease-out both" : "none",
        }} />

        {/* "RANK UP" label */}
        <div style={{
          fontSize: 11, fontWeight: 900, letterSpacing: "0.3em",
          color: "rgba(255,255,255,0.5)", marginBottom: 10,
          textTransform: "uppercase",
        }}>
          ✦ RANK UP ✦
        </div>

        {/* Rank badge */}
        <div style={{
          width: 120, height: 120, borderRadius: "50%",
          background: `radial-gradient(circle, ${color}33 0%, transparent 70%)`,
          border: `3px solid ${color}`,
          boxShadow: `0 0 40px ${color}, 0 0 80px ${color}44, inset 0 0 30px ${color}22`,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto",
          animation: phase === "show" ? "rank-pulse 0.5s ease-out both" : "none",
        }}>
          <span style={{
            fontSize: toRank.length > 1 ? 38 : 52, fontWeight: 900,
            color, textShadow: `0 0 30px ${color}`,
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            {toRank}
          </span>
        </div>

        {/* Label */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            {fromRank}-Rank → {toRank}-Rank
          </div>
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
          Ketuk untuk tutup
        </div>
      </div>
    </div>
  );
}
