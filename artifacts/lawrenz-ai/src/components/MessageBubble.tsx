import { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import type { Message } from "@/hooks/useChat";
import ImageGenerating from "@/components/ImageGenerating";
import FileProcessing from "@/components/FileProcessing";

interface Props {
  message: Message;
  isStreaming?: boolean;
  index?: number;
}

const darkNeonTheme: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: "#e0e0ff", fontFamily: "var(--app-font-mono)", fontSize: "13px", lineHeight: "1.6" },
  'pre[class*="language-"]':  { background: "transparent", margin: 0, padding: "14px 16px", overflow: "auto" },
  keyword:      { color: "#ff79c6" },
  string:       { color: "#00ff88" },
  number:       { color: "#bd93f9" },
  comment:      { color: "#6272a4", fontStyle: "italic" },
  function:     { color: "#00d4ff" },
  operator:     { color: "#ff79c6" },
  punctuation:  { color: "#ccc" },
  boolean:      { color: "#bd93f9" },
  variable:     { color: "#e0e0ff" },
  property:     { color: "#9d4edd" },
  tag:          { color: "#ff79c6" },
  "attr-name":  { color: "#00d4ff" },
  "attr-value": { color: "#00ff88" },
  builtin:      { color: "#00d4ff" },
  constant:     { color: "#bd93f9" },
  "class-name": { color: "#00d4ff" },
  selector:     { color: "#00ff88" },
  important:    { color: "#ff5555", fontWeight: "bold" },
  atrule:       { color: "#ff79c6" },
};

/* ── ImageCard with loading state ───────────────────────────────────────── */
function ImageCard({ imageUrl, content }: { imageUrl: string; content: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [dots, setDots] = useState(".");

  // Animate loading dots
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

      {/* Loading shimmer while image fetches from Pollinations */}
      {!loaded && !error && (
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            height: 280,
            borderRadius: 10,
            background: "linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(157,78,221,0.08) 50%, rgba(0,255,136,0.04) 100%)",
            border: "1px solid rgba(0,212,255,0.2)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Shimmer sweep */}
          <div style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, transparent 0%, rgba(0,212,255,0.05) 50%, transparent 100%)",
            animation: "shimmerSweep 1.8s ease infinite",
          }} />

          {/* Spinner ring */}
          <div style={{
            width: 44,
            height: 44,
            border: "3px solid rgba(0,212,255,0.15)",
            borderTop: "3px solid var(--neon-cyan)",
            borderRadius: "50%",
            animation: "spin 0.9s linear infinite",
          }} />

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--neon-cyan)", fontFamily: "var(--app-font-mono)", letterSpacing: "0.1em" }}>
              ◈ RENDERING IMAGE{dots}
            </div>
            <div style={{ fontSize: 10, color: "rgba(160,160,220,0.5)", marginTop: 4 }}>
              Pollinations Neural Engine aktif
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loaded && (
        <div style={{
          padding: "16px 20px",
          border: "1px solid rgba(255,85,85,0.3)",
          borderRadius: 10,
          background: "rgba(255,85,85,0.06)",
          fontSize: 13,
          color: "#ff5555",
        }}>
          ⚠️ Gagal memuat gambar. Coba lagi atau klik "Open" untuk buka langsung.
        </div>
      )}

      {/* Actual image — hidden until loaded */}
      <img
        src={imageUrl}
        alt="Generated"
        style={{
          display: loaded ? "block" : "none",
          width: "100%",
          maxWidth: 480,
          maxHeight: 480,
          objectFit: "contain",
          borderRadius: 10,
          border: "1px solid rgba(0,212,255,0.2)",
          boxShadow: "0 0 30px rgba(0,212,255,0.1)",
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />

      {/* Action buttons */}
      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a
          href={imageUrl}
          download="lawrenz-ai-image.jpg"
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 11,
            color: "var(--neon-purple)",
            textDecoration: "none",
            border: "1px solid rgba(157,78,221,0.4)",
            borderRadius: 6,
            padding: "4px 12px",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(157,78,221,0.08)",
          }}
        >
          ⬇ Download
        </a>
        <a
          href={imageUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: 11,
            color: "var(--neon-cyan)",
            textDecoration: "none",
            border: "1px solid rgba(0,212,255,0.3)",
            borderRadius: 6,
            padding: "4px 12px",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(0,212,255,0.06)",
          }}
        >
          ⤢ Open
        </a>
      </div>
    </div>
  );
}

/* ── CodeBlock ───────────────────────────────────────────────────────────── */
function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [value]);

  return (
    <div className="code-block my-2">
      <div className="code-block-header">
        <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>{language || "code"}</span>
        <button onClick={copy} className="code-copy-btn">{copied ? "✓ Copied!" : "Copy"}</button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={darkNeonTheme}
        PreTag="div"
        customStyle={{ margin: 0, background: "transparent", padding: "14px 16px", fontSize: "13px", lineHeight: "1.6" }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

/* ── Main MessageBubble ──────────────────────────────────────────────────── */
export default function MessageBubble({ message, isStreaming, index = 0 }: Props) {
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

  /* ── User bubble ── */
  if (isUser) {
    return (
      <div
        ref={ref}
        className="flex justify-end px-4 py-1.5"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.3s ease, transform 0.3s ease",
        }}
      >
        <div style={{ maxWidth: "75%" }}>
          <div className="msg-user px-4 py-3" style={{ color: "#fff" }}>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: "1.6" }}>{message.content}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, color: "rgba(160,160,220,0.4)", marginTop: 3, paddingRight: 4 }}>
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
      className="flex items-start gap-3 px-4 py-1.5 group"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-10px)",
        transition: "opacity 0.35s ease, transform 0.35s ease",
      }}
    >
      {/* Avatar */}
      <div className="ai-avatar flex-shrink-0" style={{ marginTop: 2, overflow: "hidden" }}>
        <img
          src="/lawrenz/icon.png"
          alt="Z"
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
        />
      </div>

      <div style={{ maxWidth: "calc(100% - 52px)", flex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: "rgba(0,212,255,0.7)", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            LawrenZ AI
          </span>
          {isStreaming && (
            <span
              style={{
                fontSize: 9,
                background: "rgba(0,212,255,0.12)",
                border: "1px solid rgba(0,212,255,0.3)",
                color: "var(--neon-cyan)",
                borderRadius: 4,
                padding: "1px 6px",
                letterSpacing: "0.08em",
                animation: "pulseOpacity 1.2s ease infinite",
              }}
            >
              ◈ STREAMING
            </span>
          )}
        </div>

        {/* ── Image with loading state ── */}
        {message.type === "image" && message.imageUrl && (
          <ImageCard imageUrl={message.imageUrl} content={message.content} />
        )}

        {/* ── Image generating (no URL yet) ── */}
        {message.type === "image" && !message.imageUrl && (
          <ImageGenerating prompt={message.content} />
        )}

        {/* ── File processing animation ── */}
        {message.type === "file-loading" && (
          <FileProcessing fileName={message.fileName} />
        )}

        {/* ── Text / markdown ── */}
        {message.type !== "image" && message.type !== "file-loading" && (
          <div className={`msg-ai px-4 py-3 ${isStreaming ? "stream-cursor" : ""}`} style={{ position: "relative" }}>
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
                          background: "rgba(0,212,255,0.1)",
                          border: "1px solid rgba(0,212,255,0.2)",
                          borderRadius: 4,
                          padding: "1px 6px",
                          fontFamily: "var(--app-font-mono)",
                          fontSize: "0.85em",
                          color: "var(--neon-cyan)",
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
                      <div style={{ overflowX: "auto", margin: "10px 0", borderRadius: 8, border: "1px solid rgba(0,212,255,0.2)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
                      </div>
                    );
                  },
                  thead({ children }) {
                    return (
                      <thead style={{ background: "rgba(0,212,255,0.08)", borderBottom: "1px solid rgba(0,212,255,0.25)" }}>
                        {children}
                      </thead>
                    );
                  },
                  tbody({ children }) {
                    return <tbody>{children}</tbody>;
                  },
                  tr({ children }) {
                    return (
                      <tr style={{ borderBottom: "1px solid rgba(0,212,255,0.08)" }}>
                        {children}
                      </tr>
                    );
                  },
                  th({ children }) {
                    return (
                      <th style={{
                        padding: "8px 12px",
                        textAlign: "left",
                        fontWeight: 700,
                        color: "var(--neon-cyan)",
                        fontSize: 12,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}>
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td style={{
                        padding: "7px 12px",
                        color: "rgba(200,220,255,0.85)",
                        verticalAlign: "top",
                        lineHeight: 1.5,
                      }}>
                        {children}
                      </td>
                    );
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote style={{ borderLeft: "3px solid var(--neon-cyan)", paddingLeft: "12px", margin: "8px 0", color: "rgba(200,220,255,0.7)", fontStyle: "italic" }}>
                        {children}
                      </blockquote>
                    );
                  },
                  h1({ children }) { return <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--neon-cyan)", margin: "12px 0 6px" }}>{children}</h1>; },
                  h2({ children }) { return <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--neon-purple)", margin: "10px 0 5px" }}>{children}</h2>; },
                  h3({ children }) { return <h3 style={{ fontSize: 14, fontWeight: 600, color: "#00ff88", margin: "8px 0 4px" }}>{children}</h3>; },
                  strong({ children }) { return <strong style={{ color: "#fff", fontWeight: 700 }}>{children}</strong>; },
                  a({ children, href }) {
                    return (
                      <a href={href} target="_blank" rel="noreferrer"
                        style={{ color: "var(--neon-cyan)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Copy button on hover */}
            {!isStreaming && message.content && (
              <button
                onClick={copyMessage}
                title="Copy"
                className="msg-copy-btn"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: copied ? "rgba(0,255,136,0.15)" : "rgba(0,212,255,0.08)",
                  border: `1px solid ${copied ? "rgba(0,255,136,0.4)" : "rgba(0,212,255,0.2)"}`,
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 10,
                  color: copied ? "#00ff88" : "rgba(0,212,255,0.6)",
                  cursor: "pointer",
                  letterSpacing: "0.06em",
                  fontFamily: "var(--app-font-mono)",
                  opacity: 0,
                  transition: "opacity 0.2s, background 0.2s",
                }}
              >
                {copied ? "✓ COPIED" : "⎘ COPY"}
              </button>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div style={{ fontSize: 10, color: "rgba(160,160,220,0.3)", marginTop: 3, paddingLeft: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{time}</span>
          {message.type === "text" && !isStreaming && message.content && (
            <span style={{ color: "rgba(0,212,255,0.25)" }}>
              ~{Math.ceil(message.content.split(/\s+/).length / 0.75)} tok
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
