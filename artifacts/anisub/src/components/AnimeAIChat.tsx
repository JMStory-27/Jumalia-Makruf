import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Send, Loader2, Zap } from "lucide-react";
import { askAboutAnime, type AnimeAIContext, type AIChatMessage } from "@/lib/aiApi";

const SUGGESTIONS_ANIME = [
  "Plot-nya gimana sih bro? jelasin dong",
  "Karakter utamanya jahat apa baik sebenernya?",
  "Ada plot twist gila gak di anime ini?",
  "Ini cocok ditonton sama siapa?",
];

const SUGGESTIONS_EPISODE = [
  "Spoiler eps ini dong bro!",
  "Karakter apa yang penting di eps ini?",
  "Ada yang janggal ga di episode ini?",
  "Gimana kelanjutan ceritanya setelah eps ini?",
];

/* ──────────────────────────────────────────────
   LawrenzBot Logo — lightning bolt gradient SVG
   ────────────────────────────────────────────── */
function LawrenzLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="lz-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF6B00" />
          <stop offset="100%" stopColor="#FFD700" />
        </linearGradient>
      </defs>
      {/* Lightning bolt */}
      <path
        d="M13 2L4.5 13.5H11L10 22L20 10H13.5L13 2Z"
        fill="url(#lz-grad)"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

/* Avatar circle for bot messages */
function BotAvatar() {
  return (
    <div
      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
      style={{ background: "linear-gradient(135deg,#FF6B00,#FFD700)", boxShadow: "0 0 8px rgba(255,107,0,0.5)" }}
    >
      <LawrenzLogo size={13} />
    </div>
  );
}

/**
 * Tombol AI mengambang di pojok kanan bawah halaman detail anime.
 * Rebrand: LawrenzBot by King Lawrenz.
 */
export default function AnimeAIChat({ context, watchMode = false }: { context: AnimeAIContext; watchMode?: boolean }) {
  const isEpisodeMode = watchMode && !!context.currentEpisode;
  const SUGGESTIONS = isEpisodeMode ? SUGGESTIONS_EPISODE : SUGGESTIONS_ANIME;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    const nextMessages: AIChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const { answer } = await askAboutAnime(q, context, messages);
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anjir, LawrenzBot lagi down bro, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <>
      {/* ── FAB pill button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="button-anime-ai-fab"
          aria-label="Tanya LawrenzBot tentang anime ini"
          className="fixed z-[60] flex items-center gap-2 active:scale-95"
          style={{
            right: 16,
            bottom: 88,
            height: 44,
            paddingLeft: 14,
            paddingRight: 18,
            borderRadius: 999,
            background: "linear-gradient(135deg,#FF4500,#FF6B00,#FFB800)",
            boxShadow: "0 6px 20px rgba(255,107,0,0.55), 0 0 0 2px rgba(255,107,0,0.2)",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
            animation: "lzFabPulse 2.8s ease-in-out infinite",
          }}
        >
          <LawrenzLogo size={18} />
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
            tanya ke LawrenzBot
          </span>
          <style>{`
            @keyframes lzFabPulse {
              0%,100% { box-shadow: 0 6px 20px rgba(255,107,0,0.55), 0 0 0 2px rgba(255,107,0,0.2); }
              50%      { box-shadow: 0 8px 28px rgba(255,107,0,0.75), 0 0 0 7px rgba(255,107,0,0.07); }
            }
          `}</style>
        </button>
      )}

      {/* ── Chat overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center sm:justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-[430px] sm:rounded-2xl rounded-t-2xl flex flex-col"
            style={{
              background: "#0d0d1a",
              border: "1px solid rgba(255,107,0,0.2)",
              boxShadow: "0 -8px 40px rgba(255,107,0,0.12), 0 0 80px rgba(0,0,0,0.6)",
              maxHeight: "80vh",
              height: "80vh",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{
                borderBottom: "1px solid rgba(255,107,0,0.15)",
                background: "linear-gradient(180deg, rgba(255,107,0,0.08) 0%, transparent 100%)",
                borderRadius: "16px 16px 0 0",
              }}
            >
              {/* Logo */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg,#FF4500,#FF6B00,#FFD700)",
                  boxShadow: "0 0 16px rgba(255,107,0,0.6), 0 0 0 2px rgba(255,107,0,0.25)",
                }}
              >
                <LawrenzLogo size={22} />
              </div>

              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-extrabold" style={{ color: "#fff", letterSpacing: 0.3 }}>
                    LawrenzBot
                  </p>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(255,107,0,0.2)", color: "#FF8C42", border: "1px solid rgba(255,107,0,0.3)" }}
                  >
                    by King Lawrenz
                  </span>
                </div>
                <p className="text-xs truncate" style={{ color: "#6B7280" }}>
                  {isEpisodeMode
                    ? <>nonton <span style={{ color: "#FF8C42" }}>{context.currentEpisode}</span>? tanya aja ⚡</>
                    : <>nanya soal <span style={{ color: "#FF8C42" }}>{context.title}</span>? gue siap bro ⚡</>
                  }
                </p>
              </div>

              {/* Close */}
              <button
                onClick={() => setOpen(false)}
                data-testid="button-close-ai-chat"
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <X size={15} color="#9CA3AF" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="space-y-3">
                  {/* Welcome bubble */}
                  <div className="flex items-start gap-2">
                    <BotAvatar />
                    <div
                      className="text-sm rounded-2xl rounded-tl-sm px-3.5 py-2.5"
                      style={{ background: "rgba(255,107,0,0.08)", color: "#D1D5DB", border: "1px solid rgba(255,107,0,0.15)", maxWidth: "85%" }}
                    >
                      {isEpisodeMode
                        ? <>Lagi nonton <b style={{ color: "#FF8C42" }}>{context.title}</b> {context.currentEpisode}? tanya apapun soal anime & eps ini — gue jawab detail 🔥</>
                        : <>Anjir, <b style={{ color: "#FF8C42" }}>{context.title}</b>? gue tau banget ini wkwk — tanya apa aja bro, gue jawab sejujurnya 🔥</>
                      }
                    </div>
                  </div>
                  {/* Suggestion chips */}
                  <div className="flex flex-col gap-2 pl-8">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        data-testid={`button-ai-suggestion-${s.slice(0, 8)}`}
                        className="text-left text-xs px-3 py-2 rounded-xl"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          color: "#C4C9D4",
                          border: "1px solid rgba(255,107,0,0.15)",
                          transition: "background 0.15s",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex items-start gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && <BotAvatar />}
                  <div
                    className="max-w-[82%] text-sm rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap"
                    style={
                      m.role === "user"
                        ? {
                            background: "linear-gradient(135deg,#FF4500,#FF6B00)",
                            color: "#fff",
                            borderBottomRightRadius: 4,
                          }
                        : {
                            background: "rgba(255,107,0,0.08)",
                            color: "#E5E7EB",
                            borderBottomLeftRadius: 4,
                            border: "1px solid rgba(255,107,0,0.12)",
                          }
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-start gap-2 justify-start">
                  <BotAvatar />
                  <div
                    className="flex items-center gap-2 text-xs px-3.5 py-2.5 rounded-2xl rounded-tl-sm"
                    style={{ background: "rgba(255,107,0,0.08)", color: "#9CA3AF", border: "1px solid rgba(255,107,0,0.12)" }}
                  >
                    <Loader2 size={13} className="animate-spin" />
                    LawrenzBot lagi mikir...
                  </div>
                </div>
              )}

              {error && (
                <div
                  className="text-xs px-3 py-2 rounded-xl ml-8"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#FCA5A5", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  {error}
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-center gap-2 p-3 flex-shrink-0"
              style={{ borderTop: "1px solid rgba(255,107,0,0.12)" }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="tanya sesuatu ke LawrenzBot..."
                data-testid="input-ai-question"
                className="flex-1 text-sm px-3.5 py-2.5 rounded-full outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  border: "1px solid rgba(255,107,0,0.2)",
                }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                data-testid="button-send-ai-question"
                className="w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0 disabled:opacity-35"
                style={{ background: "linear-gradient(135deg,#FF4500,#FFB800)" }}
              >
                <Send size={15} color="#fff" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
