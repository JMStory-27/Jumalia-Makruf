import { useState, useEffect } from "react";

const STAGES = [
  { id: 0, label: "MENGANALISIS PROMPT",    sub: "Memproses instruksi visual...",      color: "#F5B000" },
  { id: 1, label: "NEURAL ENCODING",        sub: "Mengkonversi teks ke vektor...",     color: "#E07830" },
  { id: 2, label: "DIFFUSION SYNTHESIS",    sub: "Membangkitkan pixel dari noise...",  color: "#FF5500" },
  { id: 3, label: "RENDERING OUTPUT",       sub: "Mencetak hasil akhir...",            color: "#FFD700" },
];

const FAKE_TOKENS = [
  "0xF3A2", "0x9C1E", "0x7B5D", "0x2E8F", "0xA410", "0xD73C",
  "0x518B", "0xE629", "0x3F0A", "0xB94D", "0x6C2E", "0x1D7F",
];

export default function ImageGenerating({ prompt }: { prompt: string }) {
  const [stageIdx, setStageIdx] = useState(0);
  const [pct, setPct] = useState(0);
  const [tokens, setTokens] = useState<string[]>([]);
  const [glitch, setGlitch] = useState(false);
  const [pixelRows, setPixelRows] = useState<number[]>([]);

  useEffect(() => {
    const pctTimer = setInterval(() => {
      setPct((p) => Math.min(p + Math.random() * 2.2, 95));
    }, 80);
    return () => clearInterval(pctTimer);
  }, []);

  useEffect(() => {
    const stageTimer = setInterval(() => {
      setStageIdx((i) => Math.min(i + 1, STAGES.length - 1));
      setGlitch(true);
      setTimeout(() => setGlitch(false), 200);
    }, 1800);
    return () => clearInterval(stageTimer);
  }, []);

  useEffect(() => {
    const tokenTimer = setInterval(() => {
      const t = FAKE_TOKENS[Math.floor(Math.random() * FAKE_TOKENS.length)];
      setTokens((prev) => [...prev.slice(-5), t]);
    }, 200);
    return () => clearInterval(tokenTimer);
  }, []);

  useEffect(() => {
    const pixTimer = setInterval(() => {
      setPixelRows(Array.from({ length: 6 }, () => Math.random()));
    }, 120);
    return () => clearInterval(pixTimer);
  }, []);

  const stage = STAGES[stageIdx];

  return (
    <div
      className="msg-ai"
      style={{
        padding: "16px",
        minWidth: 280,
        maxWidth: 360,
        position: "relative",
        overflow: "hidden",
        borderColor: `${stage.color}30`,
        boxShadow: `0 0 30px ${stage.color}15, inset 0 0 30px ${stage.color}05`,
        transition: "border-color 0.4s, box-shadow 0.4s",
      }}
    >
      {/* Corner accents */}
      {[
        { top: 0, left: 0, borderTop: `2px solid ${stage.color}`, borderLeft: `2px solid ${stage.color}` },
        { top: 0, right: 0, borderTop: `2px solid ${stage.color}`, borderRight: `2px solid ${stage.color}` },
        { bottom: 0, left: 0, borderBottom: `2px solid ${stage.color}`, borderLeft: `2px solid ${stage.color}` },
        { bottom: 0, right: 0, borderBottom: `2px solid ${stage.color}`, borderRight: `2px solid ${stage.color}` },
      ].map((s, i) => (
        <div key={i} style={{ position: "absolute", width: 16, height: 16, transition: "border-color 0.4s", ...s }} />
      ))}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
          color: stage.color, fontFamily: "var(--app-font-mono)",
          transition: "color 0.4s",
        }}>
          ◈ IMAGE SYNTHESIS ENGINE
        </span>
        <span style={{
          fontSize: 10, fontFamily: "var(--app-font-mono)",
          color: "rgba(220,180,80,0.5)",
          background: "rgba(0,0,0,0.4)",
          padding: "1px 6px", borderRadius: 3,
        }}>
          {Math.floor(pct)}%
        </span>
      </div>

      {/* Pixel preview */}
      <div style={{
        height: 72, borderRadius: 6, overflow: "hidden",
        background: "rgba(0,0,0,0.55)",
        border: `1px solid ${stage.color}20`,
        marginBottom: 12, position: "relative",
        display: "flex", flexDirection: "column",
        transition: "border-color 0.4s",
      }}>
        {pixelRows.map((v, i) => (
          <div key={i} style={{
            flex: 1,
            background: `linear-gradient(90deg,
              rgba(${v > 0.5 ? "245,176,0" : "224,120,48"},${v * 0.18}) ${Math.floor(v * 30)}%,
              rgba(${v > 0.3 ? "255,215,0" : "201,123,46"},${v * 0.12}) ${Math.floor(v * 60)}%,
              transparent)`,
            transition: "background 0.1s ease",
          }} />
        ))}
        <div style={{
          position: "absolute", inset: 0,
          background: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(245,176,0,0.03) 3px, rgba(245,176,0,0.03) 4px)`,
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <span style={{
            fontSize: 9, letterSpacing: "0.2em",
            color: `${stage.color}80`,
            fontFamily: "var(--app-font-mono)",
            fontWeight: 700,
          }}>
            MEMBANGUN GAMBAR...
          </span>
        </div>
      </div>

      {/* Stage indicator */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: stage.color,
            boxShadow: `0 0 10px ${stage.color}`,
            animation: "blink 0.6s step-end infinite",
          }} />
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: glitch ? "#FFD700" : stage.color,
            fontFamily: "var(--app-font-mono)",
            letterSpacing: "0.08em",
            transition: "color 0.1s",
          }}>
            {stage.label}
          </span>
        </div>
        <div style={{
          fontSize: 10, color: "rgba(220,180,80,0.45)",
          fontFamily: "var(--app-font-mono)", paddingLeft: 16,
        }}>
          {stage.sub}
        </div>
      </div>

      {/* Stage progress dots */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
        {STAGES.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{
              width: 22, height: 4, borderRadius: 2,
              background: i < stageIdx
                ? "rgba(255,215,0,0.7)"
                : i === stageIdx
                  ? stage.color
                  : "rgba(245,176,0,0.12)",
              boxShadow: i === stageIdx ? `0 0 10px ${stage.color}` : "none",
              transition: "all 0.4s ease",
            }} />
            {i < STAGES.length - 1 && (
              <div style={{ width: 4, height: 1, background: "rgba(245,176,0,0.15)" }} />
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{
        height: 4, background: "rgba(0,0,0,0.5)",
        borderRadius: 2, overflow: "hidden", marginBottom: 10,
        border: "1px solid rgba(245,176,0,0.1)",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${stage.color}, #E07830)`,
          boxShadow: `0 0 12px ${stage.color}`,
          borderRadius: 2,
          transition: "width 0.08s linear",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", right: 0, top: 0, bottom: 0, width: 20,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4))",
            animation: "shimmer 1s linear infinite",
          }} />
        </div>
      </div>

      {/* Hex token stream */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {tokens.map((t, i) => (
          <span key={i} style={{
            fontSize: 8, fontFamily: "var(--app-font-mono)",
            color: i === tokens.length - 1 ? stage.color : "rgba(220,180,80,0.25)",
            background: i === tokens.length - 1 ? `${stage.color}15` : "transparent",
            padding: "1px 4px", borderRadius: 2,
            transition: "color 0.2s, background 0.2s",
          }}>
            {t}
          </span>
        ))}
      </div>

      {/* Prompt */}
      <div style={{
        fontSize: 9, color: "rgba(220,180,80,0.3)",
        fontFamily: "var(--app-font-mono)",
        borderTop: "1px solid rgba(245,176,0,0.07)",
        paddingTop: 8,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        letterSpacing: "0.03em",
      }}>
        PROMPT › {prompt}
      </div>
    </div>
  );
}
