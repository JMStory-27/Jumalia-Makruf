import { useState, useEffect } from "react";

const CHAT_STAGES = [
  { label: "MENGHUBUNGI NEURAL CORE", icon: "⬡" },
  { label: "MEMPROSES KONTEKS", icon: "◈" },
  { label: "MEMBANGUN RESPONS", icon: "▣" },
  { label: "MENCETAK OUTPUT", icon: "◎" },
];

const FILE_STAGES = [
  { label: "MEMBACA FILE", icon: "◈" },
  { label: "EKSTRAK KONTEN", icon: "▣" },
  { label: "ANALISIS NEURAL", icon: "⬡" },
  { label: "MENYUSUN JAWABAN", icon: "◎" },
];

interface Props {
  type?: "chat" | "file";
}

export default function TypingIndicator({ type = "chat" }: Props) {
  const stages = type === "file" ? FILE_STAGES : CHAT_STAGES;
  const [stageIdx, setStageIdx] = useState(0);
  const [dots, setDots] = useState(0);
  const [glitch, setGlitch] = useState(false);
  const [scanPos, setScanPos] = useState(0);

  useEffect(() => {
    const stageTimer = setInterval(() => {
      setStageIdx((i) => (i + 1) % stages.length);
      setGlitch(true);
      setTimeout(() => setGlitch(false), 180);
    }, 1400);
    return () => clearInterval(stageTimer);
  }, [stages.length]);

  useEffect(() => {
    const dotTimer = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(dotTimer);
  }, []);

  useEffect(() => {
    const scanTimer = setInterval(() => setScanPos((p) => (p + 2) % 104), 30);
    return () => clearInterval(scanTimer);
  }, []);

  const stage = stages[stageIdx];
  const dotStr = ".".repeat(dots);
  const progress = ((stageIdx + 1) / stages.length) * 100;

  return (
    <div className="flex items-start gap-3 px-4 py-2">
      {/* Avatar */}
      <div
        className="ai-avatar flex-shrink-0"
        style={{
          marginTop: 2,
          overflow: "hidden",
          boxShadow: "0 0 20px rgba(0,212,255,0.6), 0 0 40px rgba(0,212,255,0.3)",
          animation: "glow-pulse 1s ease-in-out infinite",
        }}
      >
        <img
          src="/lawrenz/icon.png"
          alt="Z"
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
        />
      </div>

      {/* Processing card */}
      <div
        className="msg-ai"
        style={{
          padding: "14px 16px",
          minWidth: 240,
          maxWidth: 340,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Scan line */}
        <div
          style={{
            position: "absolute",
            top: `${scanPos}%`,
            left: 0,
            right: 0,
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)",
            pointerEvents: "none",
            transition: "top 30ms linear",
          }}
        />

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(0,212,255,0.5)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontFamily: "var(--app-font-mono)",
            }}
          >
            LAWRENZ AI
          </span>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#00ff88",
              boxShadow: "0 0 8px #00ff88",
              animation: "blink 0.8s step-end infinite",
            }}
          />
        </div>

        {/* Stage icon + label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 22,
              color: "var(--neon-cyan)",
              fontFamily: "var(--app-font-mono)",
              animation: "neon-pulse 1s ease-in-out infinite",
              display: "inline-block",
              transform: glitch ? "translateX(2px) skewX(-5deg)" : "none",
              transition: "transform 80ms",
            }}
          >
            {stage.icon}
          </span>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: glitch ? "rgba(0,255,136,0.9)" : "rgba(0,212,255,0.9)",
                letterSpacing: "0.08em",
                fontFamily: "var(--app-font-mono)",
                transition: "color 100ms",
              }}
            >
              {stage.label}
              <span style={{ color: "rgba(0,212,255,0.5)" }}>{dotStr}</span>
            </div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(160,160,220,0.4)",
                letterSpacing: "0.06em",
                fontFamily: "var(--app-font-mono)",
                marginTop: 1,
              }}
            >
              PROSES {stageIdx + 1}/{stages.length}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 3,
            background: "rgba(0,212,255,0.1)",
            borderRadius: 2,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, var(--neon-cyan), var(--neon-purple))",
              borderRadius: 2,
              boxShadow: "0 0 8px var(--neon-cyan)",
              transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
          {/* Shimmer on bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: "40%",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
              animation: "shimmer 1.2s linear infinite",
              backgroundSize: "200% 100%",
            }}
          />
        </div>

        {/* Mini hex nodes */}
        <div
          style={{
            display: "flex",
            gap: 4,
            marginTop: 10,
            alignItems: "center",
          }}
        >
          {stages.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background:
                  i < stageIdx
                    ? "rgba(0,255,136,0.7)"
                    : i === stageIdx
                    ? "rgba(0,212,255,0.9)"
                    : "rgba(0,212,255,0.1)",
                boxShadow:
                  i === stageIdx
                    ? "0 0 8px var(--neon-cyan)"
                    : i < stageIdx
                    ? "0 0 6px rgba(0,255,136,0.6)"
                    : "none",
                transition: "all 0.3s ease",
              }}
            />
          ))}
          <span
            style={{
              fontSize: 9,
              color: "rgba(160,160,220,0.35)",
              fontFamily: "var(--app-font-mono)",
              marginLeft: 4,
              letterSpacing: "0.05em",
            }}
          >
            NEURAL CORE AKTIF
          </span>
        </div>
      </div>
    </div>
  );
}
