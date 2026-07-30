import { useState, useRef } from "react";
import html2canvas from "html2canvas";
import { ReplyRecord } from "../types";

interface Props {
  replies: ReplyRecord[];
  onPollNow?: () => void;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const timeStr = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const dateStr = d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    let ago = "";
    if (mins < 1) ago = "baru saja";
    else if (mins < 60) ago = `${mins} menit lalu`;
    else if (hours < 24) ago = `${hours} jam lalu`;
    else ago = dateStr;
    return `${dateStr} — ${timeStr} WIB (${ago})`;
  } catch { return iso; }
}

function isHtmlBody(body: string): boolean {
  return /<(html|body|div|p|table|span|img|a|style|head)\b/i.test(body);
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function EmailHtmlViewer({ html, replyId }: { html: string; replyId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [screenshotting, setScreenshotting] = useState(false);
  const [capturedImg, setCapturedImg] = useState<string | null>(null);

  async function takeScreenshot() {
    if (!containerRef.current || screenshotting) return;
    setScreenshotting(true);
    setCapturedImg(null);
    try {
      const canvas = await html2canvas(containerRef.current, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
        width: containerRef.current.scrollWidth,
        height: containerRef.current.scrollHeight,
        windowWidth: 600,
      });
      const dataUrl = canvas.toDataURL("image/png");
      setCapturedImg(dataUrl);
    } catch (err) {
      console.error("Screenshot error:", err);
    } finally {
      setScreenshotting(false);
    }
  }

  function downloadScreenshot() {
    if (!capturedImg) return;
    const a = document.createElement("a");
    a.download = `whatsapp-reply-${replyId.slice(0, 8)}.png`;
    a.href = capturedImg;
    a.click();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={takeScreenshot}
          disabled={screenshotting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all"
          style={{ background: screenshotting ? "#a855f708" : "#a855f718", border: "1px solid #a855f740", color: "#a855f7" }}
        >
          {screenshotting ? "⏳ Capturing..." : "📸 Screenshot"}
        </button>
        {capturedImg && (
          <button
            onClick={downloadScreenshot}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all"
            style={{ background: "#22d3ee15", border: "1px solid #22d3ee40", color: "#22d3ee" }}
          >
            💾 Download PNG
          </button>
        )}
      </div>

      {capturedImg && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #a855f725" }}>
          <div className="flex items-center gap-2 px-3 py-1.5 text-[9px] font-mono" style={{ background: "#0d0520", borderBottom: "1px solid #a855f715", color: "#a855f770" }}>
            📸 Screenshot — klik tombol Download untuk simpan
          </div>
          <img
            src={capturedImg}
            alt="Email screenshot"
            className="w-full"
            style={{ display: "block", maxHeight: 500, objectFit: "contain", background: "#fff" }}
          />
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #a855f718" }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: "#0d0520", borderBottom: "1px solid #a855f715" }}>
          <div className="flex gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#ff5f56" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#ffbd2e" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#27c93f" }} />
          </div>
          <span className="text-[9px] font-mono ml-2" style={{ color: "#a855f760" }}>
            📧 Email Asli — rendered HTML
          </span>
        </div>
        <div
          ref={containerRef}
          style={{ background: "#ffffff", minHeight: 200, maxHeight: 520, overflowY: "auto" }}
          className="email-html-container"
        >
          <div
            style={{ all: "initial", display: "block" } as React.CSSProperties}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

export function ReplyMonitor({ replies, onPollNow }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHtml, setShowHtml] = useState<string | null>(null);

  if (replies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-[#ff205015] animate-ping" style={{ animationDuration: "2.5s" }} />
          <div className="absolute inset-2 rounded-full border border-[#ff205025] animate-ping" style={{ animationDuration: "2s", animationDelay: "0.5s" }} />
          <div className="absolute inset-4 rounded-full border border-[#ff205035]" />
          <div className="absolute inset-0 flex items-center justify-center text-3xl">📭</div>
        </div>
        <div className="text-center space-y-1">
          <div className="text-[13px] font-bold font-mono" style={{ color: "#ff205070" }}>📡 IMAP Monitor Aktif</div>
          <div className="text-[10px] font-mono" style={{ color: "#7c5fa0" }}>Menunggu balasan dari WhatsApp Support...</div>
          <div className="text-[9px] font-mono" style={{ color: "#5a4a80" }}>1021801597561775@support.whatsapp.com</div>
        </div>
        <div className="flex gap-1.5">
          {[0, 0.35, 0.7].map((d, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: "#ff2050", boxShadow: "0 0 6px #ff2050", animation: `dotPulse 1.2s ${d}s ease-in-out infinite` }} />
          ))}
        </div>
        {onPollNow && (
          <button
            onClick={onPollNow}
            className="mt-2 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all"
            style={{ background: "#a855f710", border: "1px solid #a855f730", color: "#a855f770" }}
          >
            🔄 Cek Sekarang
          </button>
        )}
        <div className="text-[9px] font-mono tracking-widest" style={{ color: "#4a3060" }}>POLLING INTERVAL: 60s</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[13px] font-bold" style={{ color: "#ff2050" }}>📬 Reply Monitor</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono animate-pulse" style={{ background: "#ff205018", border: "1px solid #ff205050", color: "#ff2050" }}>
          {replies.length} BALASAN 🔴
        </span>
        {onPollNow && (
          <button
            onClick={onPollNow}
            className="px-2 py-0.5 rounded text-[9px] font-mono transition-all"
            style={{ background: "#a855f708", border: "1px solid #a855f720", color: "#a855f750" }}
          >
            🔄 Poll
          </button>
        )}
        <span className="ml-auto text-[9px] font-mono" style={{ color: "#4a3060" }}>IMAP: 60s</span>
      </div>

      {/* Reply list */}
      <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin min-h-0">
        {replies.map((reply) => {
          const hasHtml = isHtmlBody(reply.body ?? "");
          const cleanBody = stripHtml(reply.body ?? "");
          const isOpen = expanded === reply.id;
          const isShowingHtml = showHtml === reply.id;

          return (
            <div key={reply.id} className="rounded-xl overflow-hidden" style={{
              border: "1px solid #ff205030",
              boxShadow: isOpen ? "0 0 20px #ff205015" : "0 0 8px #ff205006",
              animation: "appear 0.3s ease-out",
            }}>
              {/* Header row */}
              <div
                className="flex items-start gap-3 p-3 cursor-pointer transition-colors hover:bg-white/[0.025]"
                onClick={() => setExpanded(isOpen ? null : reply.id)}
                style={{ background: isOpen ? "rgba(255,32,80,0.05)" : undefined }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 mt-0.5" style={{ background: "#ff205015", border: "1px solid #ff205035" }}>
                  📩
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono" style={{ color: "#6b5fa0" }}>DARI:</span>
                    <span className="text-[12px] font-bold font-mono truncate" style={{ color: "#f97316" }}>{reply.fromEmail}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono" style={{ color: "#4a3060" }}>KE:</span>
                    <span className="text-[11px] font-mono truncate" style={{ color: "#22d3ee80" }}>{reply.gmailAccount ?? reply.toEmail}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-[10px] font-mono shrink-0" style={{ color: "#4a3060" }}>SUBJEK:</span>
                    <span className="text-[11px] font-mono line-clamp-1" style={{ color: "#9d8abf" }}>{reply.subject}</span>
                  </div>
                  <div className="text-[9px] font-mono mt-0.5" style={{ color: "#4a3060" }}>
                    🕐 {formatTime(reply.receivedAt)}
                  </div>
                </div>
                <span className="text-[10px] font-mono shrink-0 mt-1" style={{ color: "#4a3060" }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Expanded body */}
              {isOpen && (
                <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: "1px solid #ff205018", background: "rgba(13,5,32,0.6)" }}>

                  {/* Metadata */}
                  <div className="rounded-lg p-3 font-mono text-[10px] space-y-1.5" style={{ background: "#06000f", border: "1px solid #160830" }}>
                    <div className="text-[9px] font-bold tracking-widest mb-2" style={{ color: "#ff205040" }}>📋 DETAIL BALASAN</div>
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <span style={{ color: "#6b5fa0" }}>📤 Dari</span>
                      <span style={{ color: "#f97316" }}>{reply.fromEmail}</span>
                      <span style={{ color: "#6b5fa0" }}>📥 Diterima oleh</span>
                      <span style={{ color: "#22d3ee" }}>{reply.gmailAccount ?? reply.toEmail}</span>
                      <span style={{ color: "#6b5fa0" }}>📋 Subjek</span>
                      <span style={{ color: "#c4b5fd" }}>{reply.subject}</span>
                      <span style={{ color: "#6b5fa0" }}>🕐 Waktu</span>
                      <span style={{ color: "#9d8abf" }}>{formatTime(reply.receivedAt)}</span>
                      <span style={{ color: "#6b5fa0" }}>🌐 Sumber</span>
                      <span style={{ color: "#a855f760" }}>1021801597561775@support.whatsapp.com</span>
                    </div>
                  </div>

                  {/* Toggle button */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setShowHtml(isShowingHtml ? null : reply.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all"
                      style={isShowingHtml
                        ? { background: "#ff205020", border: "1px solid #ff205050", color: "#ff8099" }
                        : { background: "#a855f712", border: "1px solid #a855f735", color: "#a855f780" }
                      }
                    >
                      {isShowingHtml ? "🔼 Tutup Email" : "📧 Lihat Email Asli"}
                    </button>
                    <div className="ml-auto flex items-center gap-1 text-[9px] font-mono" style={{ color: hasHtml ? "#a855f740" : "#4a3060" }}>
                      {hasHtml ? "✅ HTML Email" : "📝 Text Email"}
                    </div>
                  </div>

                  {isShowingHtml && reply.body && (
                    <EmailHtmlViewer html={reply.body} replyId={reply.id} />
                  )}

                  {!isShowingHtml && (
                    <div>
                      <div className="text-[9px] font-mono font-bold tracking-widest mb-2" style={{ color: "#ff205040" }}>
                        ✉️ ISI PESAN
                      </div>
                      <div
                        className="rounded-lg p-3 text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto scrollbar-thin"
                        style={{ background: "#06000f", border: "1px solid #160830", color: "#c4b5fd", lineHeight: 1.7 }}
                      >
                        {cleanBody
                          ? cleanBody
                          : <span style={{ color: "#4a3060" }}>(Klik "Lihat Email Asli" untuk tampilkan konten HTML)</span>
                        }
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-[9px] font-mono px-2 py-1.5 rounded-lg" style={{ background: "#a855f708", border: "1px solid #a855f715", color: "#7c5fa0" }}>
                    💡 Jika balasan positif, akun WA kamu mungkin sudah dipulihkan. Coba buka WhatsApp!
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
