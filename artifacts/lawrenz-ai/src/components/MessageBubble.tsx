import { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import type { Message } from "@/hooks/useChat";
import ImageGenerating from "@/components/ImageGenerating";
import FileProcessing from "@/components/FileProcessing";

SyntaxHighlighter.registerLanguage("jsx", jsx);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("markup", markup);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("c", c);
SyntaxHighlighter.registerLanguage("cpp", cpp);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("markdown", markdown);

interface Props {
  message: Message;
  isStreaming?: boolean;
  index?: number;
  onSpeak?: (text: string, msgId: string) => void;
  speakingId?: string | null;
  loadingTTSId?: string | null;
}

const cyberNeonTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: "#c8e8ff", fontFamily: "var(--app-font-mono)", fontSize: "13px", lineHeight: "1.6" },
  'pre[class*="language-"]':  { background: "transparent", margin: 0, padding: "14px 16px", overflow: "auto" },
  keyword:      { color: "#8B5CF6", fontWeight: "700", textShadow: "0 0 10px rgba(139,92,246,0.6)" },
  string:       { color: "#00FF94", textShadow: "0 0 8px rgba(0,255,148,0.3)" },
  number:       { color: "#00FF94", textShadow: "0 0 8px rgba(0,255,148,0.3)" },
  comment:      { color: "rgba(100,160,200,0.45)", fontStyle: "italic" },
  function:     { color: "#00D4FF", fontWeight: "600", textShadow: "0 0 8px rgba(0,212,255,0.4)" },
  operator:     { color: "#93C5FD" },
  punctuation:  { color: "rgba(160,210,240,0.6)" },
  boolean:      { color: "#00FF94", fontWeight: "700", textShadow: "0 0 8px rgba(0,255,148,0.5)" },
  variable:     { color: "#93C5FD", fontStyle: "italic" },
  property:     { color: "#00D4FF" },
  tag:          { color: "#00D4FF" },
  "attr-name":  { color: "#8B5CF6" },
  "attr-value": { color: "#00FF94" },
  builtin:      { color: "#38BDF8" },
  constant:     { color: "#00FF94" },
  "class-name": { color: "#8B5CF6", fontWeight: "700", textShadow: "0 0 8px rgba(139,92,246,0.4)" },
  selector:     { color: "#8B5CF6" },
  important:    { color: "#FF006E", fontWeight: "bold" },
  atrule:       { color: "#00D4FF" },
};

const C  = "#00D4FF";
const CA = (a: number) => `rgba(0,212,255,${a})`;
const V  = "#8B5CF6";
const VA = (a: number) => `rgba(139,92,246,${a})`;
const G  = "#00FF94";

/* ── AI File Download Button ─────────────────────────────────────────────── */
function FileDownloadButton({ name, content }: { name: string; content: string }) {
  const download = useCallback(() => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, [name, content]);

  return (
    <button
      onClick={download}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: CA(0.08), border: `1px solid ${CA(0.32)}`,
        borderRadius: 7, padding: "5px 12px", cursor: "pointer",
        color: C, fontSize: 11, fontFamily: "var(--app-font-mono)",
        letterSpacing: "0.06em", transition: "all 0.2s",
        marginTop: 8, boxShadow: `0 0 10px ${CA(0.1)}`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = CA(0.16);
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 18px ${CA(0.25)}`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = CA(0.08);
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 10px ${CA(0.1)}`;
      }}
    >
      💾 {name}
    </button>
  );
}

/* ── ImageCard with loading state ────────────────────────────────────────── */
function ImageCard({ imageUrl, content }: { imageUrl: string; content: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [dots, setDots] = useState(".");

  useEffect(() => {
    if (loaded || error) return;
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "." : d + ".")), 500);
    return () => clearInterval(t);
  }, [loaded, error]);

  return (
    <div className="msg-ai px-4 py-3">
      {content && (
        <p className="prose-neon" style={{ fontSize: 14, marginBottom: 12 }}>
          {content}
        </p>
      )}

      {!loaded && !error && (
        <div style={{
          width: "100%", maxWidth: 420, height: 280, borderRadius: 10,
          background: `linear-gradient(135deg, ${CA(0.04)} 0%, ${VA(0.06)} 50%, rgba(0,255,148,0.03) 100%)`,
          border: `1px solid ${CA(0.18)}`,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 14, position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(90deg, transparent 0%, ${CA(0.06)} 50%, transparent 100%)`,
            animation: "shimmerSweep 1.8s ease infinite",
          }} />
          <div style={{
            width: 44, height: 44,
            border: `3px solid ${CA(0.15)}`,
            borderTop: `3px solid ${C}`,
            borderRadius: "50%", animation: "spin 0.9s linear infinite",
            boxShadow: `0 0 20px ${CA(0.3)}`,
          }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: C, fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em", textShadow: `0 0 10px ${C}` }}>
              ◈ RENDERING IMAGE{dots}
            </div>
            <div style={{ fontSize: 10, color: CA(0.4), marginTop: 4 }}>
              Neural Image Engine aktif
            </div>
          </div>
        </div>
      )}

      {error && !loaded && (
        <div style={{ padding: "16px 20px", border: "1px solid rgba(255,0,110,0.3)", borderRadius: 10, background: "rgba(255,0,110,0.06)", fontSize: 13, color: "#FF006E" }}>
          ⚠️ Gagal memuat gambar. Klik "Open" untuk buka langsung.
        </div>
      )}

      <img
        src={imageUrl}
        alt="Generated"
        style={{
          display: loaded ? "block" : "none",
          width: "100%", maxWidth: 480, maxHeight: 480,
          objectFit: "contain", borderRadius: 10,
          border: `1px solid ${VA(0.4)}`,
          boxShadow: `0 0 30px ${VA(0.15)}, 0 0 60px ${CA(0.06)}`,
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href={imageUrl} download="lawrenz-ai-image.jpg" target="_blank" rel="noreferrer"
          style={{
            fontSize: 11, color: V, textDecoration: "none",
            border: `1px solid ${VA(0.4)}`, borderRadius: 6, padding: "4px 12px",
            display: "inline-flex", alignItems: "center", gap: 5, background: VA(0.08),
          }}>
          ⬇ Download
        </a>
        <a href={imageUrl} target="_blank" rel="noreferrer"
          style={{
            fontSize: 11, color: C, textDecoration: "none",
            border: `1px solid ${CA(0.35)}`, borderRadius: 6, padding: "4px 12px",
            display: "inline-flex", alignItems: "center", gap: 5, background: CA(0.06),
          }}>
          ⤢ Open
        </a>
      </div>
    </div>
  );
}

/* ── CodeBlock ────────────────────────────────────────────────────────────── */
function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  const download = useCallback(() => {
    const ext: Record<string, string> = {
      javascript: "js", typescript: "ts", python: "py", go: "go",
      rust: "rs", java: "java", cpp: "cpp", c: "c", css: "css",
      html: "html", json: "json", yaml: "yaml", bash: "sh", shell: "sh",
      php: "php", ruby: "rb", swift: "swift", kotlin: "kt",
    };
    const extension = ext[language?.toLowerCase()] || language || "txt";
    const blob = new Blob([value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [value, language]);

  return (
    <div className="code-block my-2">
      <div className="code-block-header">
        <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{language || "code"}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={download}
            className="code-copy-btn"
            title={`Download as .${language || "txt"}`}
          >
            💾 Save
          </button>
          <button onClick={copy} className="code-copy-btn">
            {copied ? "✓ Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={cyberNeonTheme}
        PreTag="div"
        customStyle={{ margin: 0, background: "transparent", padding: "14px 16px", fontSize: "13px", lineHeight: "1.6" }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

/* ── TTS Button ───────────────────────────────────────────────────────────── */
function TTSButton({ msgId, text, onSpeak, isSpeaking, isLoading }: {
  msgId: string; text: string;
  onSpeak: (text: string, id: string) => void;
  isSpeaking: boolean; isLoading: boolean;
}) {
  return (
    <button
      onClick={() => onSpeak(text, msgId)}
      title={isSpeaking ? "Berhenti" : isLoading ? "Loading suara..." : "Dengarkan"}
      style={{
        background: isSpeaking ? CA(0.15) : isLoading ? CA(0.08) : CA(0.05),
        border: `1px solid ${isSpeaking ? CA(0.5) : CA(0.2)}`,
        borderRadius: 6, padding: "3px 9px", fontSize: 11,
        color: isSpeaking ? C : isLoading ? CA(0.6) : CA(0.4),
        cursor: isLoading ? "wait" : "pointer",
        letterSpacing: "0.04em", fontFamily: "var(--app-font-mono)",
        display: "inline-flex", alignItems: "center", gap: 4, transition: "all 0.2s",
        animation: isSpeaking ? "pulseOpacity 1.5s ease infinite" : "none",
        boxShadow: isSpeaking ? `0 0 12px ${CA(0.3)}` : "none",
      }}
    >
      {isLoading ? "◌" : isSpeaking ? "⏸" : "▶"}
      <span>{isLoading ? "LOADING" : isSpeaking ? "STOP" : "SUARA"}</span>
    </button>
  );
}

/* ── Main MessageBubble ───────────────────────────────────────────────────── */
export default function MessageBubble({ message, isStreaming, index = 0, onSpeak, speakingId, loadingTTSId }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const time = message.timestamp.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    const delay = Math.min(index * 30, 150);
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [index]);

  const copyMessage = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [message.content]);

  const isSpeaking = speakingId === message.id;
  const isTTSLoading = loadingTTSId === message.id;
  const showTTS = !isUser && !isStreaming && message.content && message.type !== "image" && message.type !== "file-loading" && !!onSpeak;

  /* ── User bubble ── */
  if (isUser) {
    return (
      <div
        ref={ref}
        className="flex justify-end px-4 py-1.5"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)", transition: "opacity 0.3s ease, transform 0.3s ease" }}
      >
        <div style={{ maxWidth: "78%" }}>
          {/* User-sent image preview for vision/img2img */}
          {message.userImageBase64 && (
            <div style={{ marginBottom: 6, display: "flex", justifyContent: "flex-end" }}>
              <div style={{ position: "relative" }}>
                <img
                  src={`data:${message.userImageMimeType || "image/jpeg"};base64,${message.userImageBase64}`}
                  alt="Sent"
                  style={{
                    maxWidth: 220, maxHeight: 180, borderRadius: 10, objectFit: "cover",
                    border: `1px solid ${VA(0.45)}`,
                    boxShadow: `0 0 16px ${VA(0.2)}`,
                  }}
                />
                <div style={{
                  position: "absolute", bottom: 4, left: 4,
                  background: "rgba(0,0,0,0.7)", borderRadius: 4, padding: "2px 6px",
                  fontSize: 9, color: G, fontFamily: "var(--app-font-mono)",
                }}>
                  {message.type === "user-image" ? "📸 IMAGE" : "📎 FILE"}
                </div>
              </div>
            </div>
          )}
          <div className="msg-user px-4 py-3" style={{ color: "#e8f4ff" }}>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: "1.6" }}>{message.content}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, color: CA(0.28), marginTop: 3, paddingRight: 4 }}>
            {time}
          </div>
        </div>
      </div>
    );
  }

  /* ── AI bubble ── */
  return (
    <div
      ref={ref}
      className="flex items-start gap-2 px-2 py-1 group"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-10px)", transition: "opacity 0.35s ease, transform 0.35s ease" }}
    >
      {/* Avatar */}
      <div className="ai-avatar flex-shrink-0" style={{ marginTop: 4, overflow: "hidden" }}>
        <img src="/lawrenz/icon.png" alt="Z" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: CA(0.7), fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", textShadow: `0 0 8px ${CA(0.4)}` }}>
            ◈ LawrenZ AI
          </span>
          {isStreaming && (
            <span style={{
              fontSize: 9, background: CA(0.08),
              border: `1px solid ${CA(0.3)}`, color: G,
              borderRadius: 4, padding: "1px 6px", letterSpacing: "0.08em",
              animation: "pulseOpacity 1.2s ease infinite",
              textShadow: `0 0 8px ${G}`,
            }}>
              ⟳ STREAMING
            </span>
          )}
        </div>

        {/* Image with loading */}
        {message.type === "image" && message.imageUrl && (
          <ImageCard imageUrl={message.imageUrl} content={message.content} />
        )}

        {/* Image generating */}
        {message.type === "image" && !message.imageUrl && (
          <ImageGenerating prompt={message.content} />
        )}

        {/* File processing */}
        {message.type === "file-loading" && (
          <FileProcessing fileName={message.fileName} />
        )}

        {/* Text / markdown */}
        {message.type !== "image" && message.type !== "file-loading" && (
          <div className={`msg-ai px-3 py-3 ${isStreaming ? "stream-cursor" : ""}`} style={{ position: "relative", width: "100%" }}>
            <div className="prose-neon" style={{ fontSize: 14 }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const isBlock = className?.startsWith("language-");
                    if (isBlock) {
                      return <CodeBlock language={match?.[1] || ""} value={String(children).replace(/\n$/, "")} />;
                    }
                    return (
                      <code
                        className={className}
                        style={{
                          background: CA(0.08),
                          border: `1px solid ${CA(0.2)}`,
                          borderRadius: 4, padding: "1px 6px",
                          fontFamily: "var(--app-font-mono)",
                          fontSize: "0.85em", color: C,
                        }}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  pre({ children }) { return <>{children}</>; },
                  p({ children }) { return <p style={{ margin: "6px 0", lineHeight: 1.7 }}>{children}</p>; },
                  ul({ children }) { return <ul style={{ paddingLeft: "1.4em", margin: "6px 0" }}>{children}</ul>; },
                  ol({ children }) { return <ol style={{ paddingLeft: "1.4em", margin: "6px 0" }}>{children}</ol>; },
                  table({ children }) {
                    return (
                      <div style={{
                        overflowX: "auto",
                        margin: "12px 0",
                        borderRadius: 10,
                        border: `1px solid ${CA(0.14)}`,
                        WebkitOverflowScrolling: "touch",
                        display: "block",
                        width: "100%",
                      }}>
                        <table style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 13,
                          tableLayout: "auto",
                        }}>{children}</table>
                      </div>
                    );
                  },
                  thead({ children }) {
                    return <thead style={{ background: CA(0.07), borderBottom: `2px solid ${CA(0.22)}` }}>{children}</thead>;
                  },
                  tbody({ children }) { return <tbody>{children}</tbody>; },
                  tr({ children }) {
                    return <tr style={{ borderBottom: `1px solid ${CA(0.07)}` }}>{children}</tr>;
                  },
                  th({ children }) {
                    return <th style={{
                      padding: "9px 12px", textAlign: "left", fontWeight: 700,
                      color: C, fontSize: 11, letterSpacing: "0.05em",
                      textTransform: "uppercase", whiteSpace: "nowrap",
                      textShadow: `0 0 8px ${CA(0.4)}`,
                    }}>{children}</th>;
                  },
                  td({ children }) {
                    return <td style={{
                      padding: "8px 12px", color: "rgba(180,220,255,0.85)",
                      verticalAlign: "top", lineHeight: 1.6,
                      wordBreak: "break-word", minWidth: 80,
                    }}>{children}</td>;
                  },
                  blockquote({ children }) {
                    return <blockquote style={{ borderLeft: `3px solid ${V}`, paddingLeft: "12px", margin: "8px 0", color: "rgba(180,200,255,0.65)", fontStyle: "italic", background: VA(0.04), borderRadius: "0 8px 8px 0", padding: "8px 12px" }}>{children}</blockquote>;
                  },
                  h1({ children }) { return <h1 style={{ fontSize: 18, fontWeight: 700, color: C, margin: "12px 0 6px", textShadow: `0 0 12px ${CA(0.4)}` }}>{children}</h1>; },
                  h2({ children }) { return <h2 style={{ fontSize: 16, fontWeight: 700, color: V, margin: "10px 0 5px", textShadow: `0 0 10px ${VA(0.4)}` }}>{children}</h2>; },
                  h3({ children }) { return <h3 style={{ fontSize: 14, fontWeight: 600, color: G, margin: "8px 0 4px" }}>{children}</h3>; },
                  strong({ children }) { return <strong style={{ color: "#fff", fontWeight: 700 }}>{children}</strong>; },
                  a({ children, href }) {
                    return <a href={href} target="_blank" rel="noreferrer" style={{ color: C, textDecoration: "underline", textUnderlineOffset: 3 }}>{children}</a>;
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* AI file downloads */}
            {!isStreaming && message.fileDownloads && message.fileDownloads.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {message.fileDownloads.map((dl) => (
                  <FileDownloadButton key={dl.name} name={dl.name} content={dl.content} />
                ))}
              </div>
            )}

            {/* Copy + TTS buttons */}
            {!isStreaming && message.content && (
              <div
                className="msg-copy-btn"
                style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 5, opacity: 0, transition: "opacity 0.2s" }}
              >
                {showTTS && (
                  <TTSButton msgId={message.id} text={message.content} onSpeak={onSpeak!} isSpeaking={isSpeaking} isLoading={isTTSLoading} />
                )}
                <button
                  onClick={copyMessage}
                  title="Copy"
                  style={{
                    background: copied ? CA(0.14) : CA(0.06),
                    border: `1px solid ${copied ? CA(0.45) : CA(0.18)}`,
                    borderRadius: 6, padding: "3px 8px", fontSize: 10,
                    color: copied ? C : CA(0.55),
                    cursor: "pointer", letterSpacing: "0.06em",
                    fontFamily: "var(--app-font-mono)",
                    boxShadow: copied ? `0 0 10px ${CA(0.3)}` : "none",
                    transition: "all 0.15s",
                  }}
                >
                  {copied ? "✓ COPIED" : "⎘ COPY"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div style={{ fontSize: 10, color: CA(0.22), marginTop: 3, paddingLeft: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{time}</span>
          {message.type === "text" && !isStreaming && message.content && (
            <span style={{ color: CA(0.18) }}>
              ~{Math.ceil(message.content.split(/\s+/).length / 0.75)} tok
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
