import { useRef, useEffect, useState } from "react";

interface EmailPreviewProps {
  fromEmail: string;
  subject: string;
  htmlBody: string;
  accountCount: number;
}

const TO_EMAIL = "1021801597561775@support.whatsapp.com";
const AVATAR_COLORS = ["#8ab4f8", "#81c995", "#f28b82", "#fdd663", "#c58af9", "#78d9ec"];

function avatarColor(email: string) {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function EmailPreview({ fromEmail, subject, htmlBody, accountCount }: EmailPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeH, setIframeH] = useState(300);
  const [expanded, setExpanded] = useState(false);

  const MAX_H = expanded ? 9999 : 320;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const resize = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc?.body) {
          const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
          setIframeH(h + 8);
        }
      } catch (_) {}
    };
    iframe.addEventListener("load", resize);
    return () => iframe.removeEventListener("load", resize);
  }, [htmlBody]);

  const initials = fromEmail.slice(0, 2).toUpperCase();
  const bg = avatarColor(fromEmail);
  const displayName = fromEmail.split("@")[0];

  return (
    <div
      style={{
        background: "#1e1e2e",
        border: "1px solid #3a3a4a",
        borderRadius: 14,
        overflow: "hidden",
        fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
      }}
    >
      {/* ── Label bar ── */}
      <div
        style={{
          background: "rgba(168,85,247,0.12)",
          borderBottom: "1px solid #3a3a4a",
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: "#a855f7", letterSpacing: 2, textTransform: "uppercase", fontFamily: "monospace" }}>
          📧 PREVIEW EMAIL — BELUM TERKIRIM
        </span>
        <span style={{ fontSize: 10, color: "#6b5fa0", fontFamily: "monospace" }}>
          {accountCount} akun akan kirim email ini
        </span>
      </div>

      {/* ── Gmail dark header ── */}
      <div style={{ background: "#202124", padding: "14px 16px 10px" }}>
        {/* Subject */}
        <div style={{ fontSize: 17, fontWeight: 500, color: "#e8eaed", marginBottom: 14, lineHeight: 1.35 }}>
          {subject}
        </div>

        {/* From row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 700, color: "#202124",
            flexShrink: 0, userSelect: "none",
          }}>
            {initials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: "#e8eaed", fontWeight: 500 }}>{displayName}</span>
              <span style={{ fontSize: 11.5, color: "#9aa0a6" }}>&lt;{fromEmail}&gt;</span>
            </div>

            {/* To */}
            <div style={{ marginTop: 4, fontSize: 12, color: "#9aa0a6", display: "flex", alignItems: "center", gap: 6 }}>
              <span>ke</span>
              <span style={{
                background: "rgba(138,180,248,0.12)",
                border: "1px solid rgba(138,180,248,0.25)",
                borderRadius: 100,
                padding: "1px 8px",
                fontSize: 11.5,
                color: "#8ab4f8",
              }}>{TO_EMAIL}</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#3c4043", margin: "10px 0 0" }} />
      </div>

      {/* ── Email body iframe ── */}
      <div
        style={{
          background: "#fff",
          maxHeight: MAX_H,
          overflow: "hidden",
          position: "relative",
          transition: "max-height 0.3s ease",
        }}
      >
        <iframe
          ref={iframeRef}
          srcDoc={htmlBody}
          title="Email Preview"
          style={{
            width: "100%",
            border: "none",
            display: "block",
            height: iframeH,
          }}
        />

        {/* Fade gradient when collapsed */}
        {!expanded && iframeH > MAX_H && (
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            height: 80,
            background: "linear-gradient(to bottom, transparent, #fff)",
            pointerEvents: "none",
          }} />
        )}
      </div>

      {/* ── Expand / Collapse ── */}
      {iframeH > 320 && (
        <button
          onClick={() => setExpanded(p => !p)}
          style={{
            width: "100%",
            padding: "8px",
            background: "#202124",
            border: "none",
            borderTop: "1px solid #3c4043",
            cursor: "pointer",
            fontSize: 11,
            color: "#8ab4f8",
            fontFamily: "monospace",
            letterSpacing: 1,
          }}
        >
          {expanded ? "▲ SEMBUNYIKAN" : "▼ LIHAT SELENGKAPNYA"}
        </button>
      )}
    </div>
  );
}
