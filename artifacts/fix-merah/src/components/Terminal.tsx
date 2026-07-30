import { useEffect, useRef, useState } from "react";
import { TerminalLog } from "../types";

interface Props {
  logs: TerminalLog[];
}

const TYPE_STYLE: Record<string, { bg: string; text: string; label: string; emoji: string }> = {
  info:    { bg: "#22d3ee20", text: "#22d3ee", label: "INFO", emoji: "ℹ" },
  success: { bg: "#a855f722", text: "#a855f7", label: " OK ", emoji: "✅" },
  error:   { bg: "#ff205022", text: "#ff2050", label: "FAIL", emoji: "❌" },
  warn:    { bg: "#fbbf2420", text: "#fbbf24", label: "WARN", emoji: "⚠" },
  system:  { bg: "#f9731620", text: "#f97316", label: "SYS ", emoji: "⚙" },
  packet:  { bg: "#fbbf2418", text: "#f59e0b", label: "PKT ", emoji: "📦" },
};

const MSG_COLOR: Record<string, string> = {
  info:    "#93c5fd",
  success: "#c4b5fd",
  error:   "#fca5a5",
  warn:    "#fde68a",
  system:  "#fdba74",
  packet:  "#fcd34d",
};

const EMOJI_RULES: [RegExp, string][] = [
  [/terkirim|✓.*kirim|sent\b/i, "✅"],
  [/gagal|failed|✗/i, "❌"],
  [/bomb/i, "💣"],
  [/imap|inbox/i, "📬"],
  [/smtp|mengirim/i, "📤"],
  [/balasan|reply/i, "💬"],
  [/api.*ready|server.*ready/i, "🟢"],
  [/menunggu|waiting|standby/i, "⏳"],
  [/monitor|memantau/i, "👁"],
  [/step\s*\d/i, "📍"],
  [/poll|refresh/i, "🔄"],
  [/gmail/i, "📧"],
  [/whatsapp/i, "💬"],
  [/connect|menghubung/i, "🔌"],
  [/verif|terverifikasi/i, "✔️"],
  [/akun|account added/i, "👤"],
  [/start|mulai|init/i, "▶️"],
  [/selesai|done|complete/i, "🏁"],
];

const EMOJI_RE = /^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✅❌⚠⏳📡📬💣🟢🔌📤📧👁🔄💬📍✔▶🏁👤⚙ℹ]/u;

function enrichMsg(type: string, msg: string): string {
  if (EMOJI_RE.test(msg.trim())) return msg;
  for (const [re, emoji] of EMOJI_RULES) {
    if (re.test(msg)) return emoji + " " + msg;
  }
  const fallback: Record<string, string> = {
    info: "ℹ", success: "✅", error: "❌", warn: "⚠️", system: "⚙", packet: "📦",
  };
  return (fallback[type] ?? "▸") + " " + msg;
}

function IP() {
  const [ip] = useState(() => Array.from({ length: 4 }, () => Math.floor(Math.random() * 255)).join("."));
  return <>{ip}</>;
}

export function Terminal({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [logs]);

  return (
    <div className="flex flex-col h-full overflow-hidden font-mono" style={{ background: "rgba(6,0,15,0.97)", borderRadius: "inherit" }}>

      <style>{`
        @keyframes logEntry {
          from { opacity: 0; transform: translateX(-10px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes logFlash {
          0%   { background: rgba(168,85,247,0.18); }
          100% { background: transparent; }
        }
      `}</style>

      {/* ── Title bar ── */}
      <div
        className="flex items-center gap-2 px-3 py-2 shrink-0 overflow-hidden"
        style={{ background: "rgba(13,5,32,0.9)", borderBottom: "1px solid #a855f720" }}
      >
        <div className="flex gap-1 sm:gap-1.5 shrink-0">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ background: "#ff5f56", boxShadow: "0 0 6px #ff5f5680" }} />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ background: "#ffbd2e", boxShadow: "0 0 6px #ffbd2e80" }} />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ background: "#27c93f", boxShadow: "0 0 6px #27c93f80" }} />
        </div>
        <span className="text-[10px] sm:text-[11px] font-bold tracking-wider truncate ml-1" style={{ color: "#a855f7" }}>
          FIX-MERAH TERMINAL v2.0
        </span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span
            className="neon-badge hidden sm:inline-flex"
            style={{ background: "#a855f715", border: "1px solid #a855f730", color: "#a855f770" }}
          >ENC: AES-256</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full animate-dot" style={{ background: "#a855f7", boxShadow: "0 0 8px #a855f7" }} />
            <span className="text-[9px] font-bold" style={{ color: "#a855f7" }}>LIVE</span>
          </div>
        </div>
      </div>

      {/* ── ASCII logo ── */}
      <div className="px-3 pt-2 pb-1.5 shrink-0" style={{ borderBottom: "1px solid #a855f710" }}>
        <div className="flex items-baseline gap-3">
          <div className="text-[15px] sm:text-[22px] font-black leading-none grad-violet" style={{ letterSpacing: "0.08em" }}>
            FIX MERRH
          </div>
          <div className="flex gap-x-2 text-[8px]">
            <span className="hidden sm:inline" style={{ color: "#7c5fbf" }}>// Account Recovery</span>
            <span style={{ color: "#22d3ee35" }}>IP: <IP /></span>
            <span style={{ color: "#ff205040" }}>PROXY:ON</span>
          </div>
        </div>
      </div>

      {/* ── Logs ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 scrollbar-thin">
        {logs.length === 0 && (
          <div className="text-[11px] text-center pt-6" style={{ color: "#5a3a8a" }}>
            Sistema siap. Menunggu aktivitas...
          </div>
        )}
        {logs.map((log, idx) => {
          const s = TYPE_STYLE[log.type] ?? TYPE_STYLE.info;
          const mc = MSG_COLOR[log.type] ?? "#c4b5fd";
          const isLatest = idx === logs.length - 1;
          const enriched = enrichMsg(log.type, log.message);
          return (
            <div
              key={log.id}
              className="flex items-start gap-1.5 text-[11px] leading-5 group px-1.5 rounded transition-colors"
              style={{
                animation: "logEntry 0.22s ease-out both",
                background: isLatest ? undefined : undefined,
              }}
            >
              {/* Emoji icon */}
              <span className="shrink-0 text-[11px] leading-5 mt-px" style={{ minWidth: 16 }}>
                {s.emoji}
              </span>
              {/* Timestamp */}
              <span className="shrink-0 text-[9px] tabular-nums mt-[3px]" style={{ color: "#6b5fa0", fontVariantNumeric: "tabular-nums" }}>
                {log.timestamp}
              </span>
              {/* Type badge */}
              <span
                className="shrink-0 px-1.5 py-px rounded text-[8px] font-bold mt-px"
                style={{
                  background: s.bg,
                  color: s.text,
                  border: `1px solid ${s.text}30`,
                  boxShadow: isLatest ? `0 0 8px ${s.text}40` : undefined,
                }}
              >
                {s.label}
              </span>
              {/* Message */}
              <span
                className="break-all leading-relaxed"
                style={{
                  color: mc,
                  textShadow: isLatest ? `0 0 8px ${mc}40` : undefined,
                }}
              >
                {enriched}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Prompt bar ── */}
      <div
        className="px-4 py-2 shrink-0 flex items-center gap-2"
        style={{ borderTop: "1px solid #a855f712", background: "rgba(13,5,32,0.6)" }}
      >
        <span className="text-[11px]" style={{ color: "#6b5fa0" }}>root@fix-merah:~$</span>
        <span className="animate-blink text-[12px]" style={{ color: "#a855f760" }}>█</span>
        <div className="flex-1" />
        <span className="text-[9px] tabular-nums" style={{ color: "#5a4a80" }}>{logs.length} events</span>
      </div>
    </div>
  );
}
