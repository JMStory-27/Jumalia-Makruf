import { useState, useEffect } from "react";

const STAGES = [
  { label: "MEMBACA FILE",      sub: "Mengurai struktur dokumen...",       icon: "◈" },
  { label: "PARSING KONTEN",    sub: "Mengekstrak data & teks...",         icon: "▣" },
  { label: "ANALISIS NEURAL",   sub: "Memproses dengan AI Engine...",      icon: "⬡" },
  { label: "MENYUSUN JAWABAN",  sub: "Merangkai insight untuk kamu...",    icon: "◎" },
];

const G = "#F5B000";
const GA = (a: number) => `rgba(245,176,0,${a})`;

export default function FileProcessing({ fileName }: { fileName?: string }) {
  const [stageIdx, setStageIdx] = useState(0);
  const [pct, setPct] = useState(0);
  const [chars, setChars] = useState<string[]>([]);
  const [glitch, setGlitch] = useState(false);

  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*<>";

  useEffect(() => {
    const pctTimer = setInterval(() => {
      setPct((p) => Math.min(p + Math.random() * 2.8, 95));
    }, 90);
    return () => clearInterval(pctTimer);
  }, []);

  useEffect(() => {
    const stageTimer = setInterval(() => {
      setStageIdx((i) => Math.min(i + 1, STAGES.length - 1));
      setGlitch(true);
      setTimeout(() => setGlitch(false), 150);
    }, 1600);
    return () => clearInterval(stageTimer);
  }, []);

  useEffect(() => {
    const charTimer = setInterval(() => {
      const c = ALPHA[Math.floor(Math.random() * ALPHA.length)];
      setChars((prev) => [...prev.slice(-18), c]);
    }, 60);
    return () => clearInterval(charTimer);
  }, []);

  const stage = STAGES[stageIdx];

  return (
    <div
      className="msg-ai"
      style={{ padding: "16px", minWidth: 270, maxWidth: 340, position: "relative", overflow: "hidden" }}
    >
      {/* Animated top bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg, transparent, #F5B000, #E07830, #FFD700, transparent)",
        animation: "shimmer 2s linear infinite",
        backgroundSize: "200% 100%",
      }} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          color: G, fontFamily: "var(--app-font-mono)",
        }}>
          ◈ FILE ANALYSIS ENGINE
        </span>
        <div style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "#FFD700", boxShadow: "0 0 8px #FFD700",
          animation: "blink 0.6s step-end infinite",
        }} />
      </div>

      {/* File name badge */}
      {fileName && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
          background: GA(0.06),
          border: `1px solid ${GA(0.15)}`,
          borderRadius: 6, padding: "6px 10px",
        }}>
          <span style={{ fontSize: 14 }}>📄</span>
          <span style={{
            fontSize: 11, color: G,
            fontFamily: "var(--app-font-mono)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {fileName}
          </span>
        </div>
      )}

      {/* Random char stream */}
      <div style={{
        fontFamily: "var(--app-font-mono)", fontSize: 10,
        color: GA(0.25), letterSpacing: "0.15em",
        marginBottom: 10, minHeight: 16,
        overflow: "hidden", whiteSpace: "nowrap",
      }}>
        {chars.map((c, i) => (
          <span key={i} style={{
            color: i === chars.length - 1 ? G : i > chars.length - 4 ? GA(0.5) : GA(0.18),
            transition: "color 0.1s",
          }}>
            {c}
          </span>
        ))}
        <span style={{ color: G, animation: "blink 0.5s step-end infinite" }}>█</span>
      </div>

      {/* Stage */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{
            fontSize: 16, color: G,
            animation: "neon-pulse 1s ease-in-out infinite",
            transform: glitch ? "skewX(-8deg)" : "none",
            transition: "transform 80ms",
          }}>
            {stage.icon}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: glitch ? "#FFD700" : G,
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.08em",
            transition: "color 0.1s",
          }}>
            {stage.label}
          </span>
        </div>
        <div style={{
          fontSize: 10, color: "rgba(220,180,80,0.45)",
          fontFamily: "var(--app-font-mono)", paddingLeft: 24,
        }}>
          {stage.sub}
        </div>
      </div>

      {/* Stage squares */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {STAGES.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < stageIdx
              ? "rgba(255,215,0,0.7)"
              : i === stageIdx
                ? G
                : GA(0.1),
            boxShadow: i === stageIdx ? `0 0 10px ${G}` : "none",
            transition: "all 0.4s ease",
          }} />
        ))}
      </div>

      {/* Progress bar */}
      <div style={{
        height: 3, background: "rgba(0,0,0,0.5)",
        borderRadius: 2, overflow: "hidden",
        border: `1px solid ${GA(0.08)}`,
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${G}, #E07830)`,
          boxShadow: `0 0 10px ${G}`,
          borderRadius: 2,
          transition: "width 0.09s linear",
        }} />
      </div>

      <div style={{
        textAlign: "right", marginTop: 6, fontSize: 9,
        color: GA(0.4), fontFamily: "var(--app-font-mono)",
      }}>
        {Math.floor(pct)}% SELESAI
      </div>
    </div>
  );
}
