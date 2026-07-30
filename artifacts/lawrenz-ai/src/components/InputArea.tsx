import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMode } from "@/hooks/useChat";
import { detectIntent } from "@/hooks/useChat";
import { useSTT } from "@/hooks/useSTT";

interface Props {
  mode: ChatMode;
  isLoading: boolean;
  onSend: (content: string, opts?: {
    file?: File;
    imagePrompt?: string;
    useSearch?: boolean;
    visionImage?: File;
    img2imgFile?: File;
    learnMode?: boolean;
  }) => void;
  onStop: () => void;
  fileContextName?: string;
  onClearContext?: () => void;
}

const IMAGE_MIME = new Set(["image/png","image/jpeg","image/jpg","image/webp","image/gif","image/heic","image/bmp","image/svg+xml"]);
const isImageFile = (f: File) => IMAGE_MIME.has(f.type.toLowerCase()) || /\.(png|jpe?g|webp|gif|heic|bmp|svg)$/i.test(f.name);

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.8);
}

type AttachMode = "analyze" | "learn" | "vision" | "img2img";

export default function InputArea({ mode, isLoading, onSend, onStop, fileContextName, onClearContext }: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attachMode, setAttachMode] = useState<AttachMode>("analyze");
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loadingDot, setLoadingDot] = useState(0);
  const [imgPreviewUrl, setImgPreviewUrl] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading) return;
    const t = setInterval(() => setLoadingDot((d) => (d + 1) % 4), 350);
    return () => clearInterval(t);
  }, [isLoading]);

  useEffect(() => {
    if (!file || !isImageFile(file)) { setImgPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setImgPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    if (isImageFile(file)) {
      setAttachMode("vision");
    } else {
      setAttachMode("analyze");
    }
  }, [file]);

  const { recording, transcribing, toggle: toggleMic } = useSTT(
    useCallback((transcript: string) => {
      setText((prev) => (prev ? prev + " " + transcript : transcript));
      setTimeout(() => textRef.current?.focus(), 50);
    }, [])
  );

  const intent = text.trim() && !file ? detectIntent(text) : file ? "file" : null;
  const isCoding = mode === "coding";

  const handleSend = useCallback(() => {
    if (isLoading) return;
    const trimmed = text.trim();

    if (file) {
      if (attachMode === "learn") {
        onSend(trimmed, { file, learnMode: true });
      } else if (attachMode === "vision") {
        onSend(trimmed || "Analisis gambar ini secara detail.", { visionImage: file });
      } else if (attachMode === "img2img") {
        onSend(trimmed || "Buat gambar baru berdasarkan referensi ini.", { img2imgFile: file });
      } else {
        onSend(trimmed || "Analisis dan jelaskan isi file ini secara detail.", { file });
      }
      setText("");
      setFile(null);
      return;
    }

    if (!trimmed) return;

    if (mode === "daily") {
      const detectedIntent = detectIntent(trimmed);
      if (detectedIntent === "img2img") {
        onSend(trimmed);
      } else if (detectedIntent === "image") {
        onSend("", { imagePrompt: trimmed });
      } else {
        onSend(trimmed);
      }
    } else {
      onSend(trimmed);
    }

    setText("");
    setTimeout(() => textRef.current?.focus(), 50);
  }, [isLoading, text, file, attachMode, mode, onSend]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    },
    [handleSend]
  );

  const handleFile = useCallback((f: File) => {
    if (f.size > 50 * 1024 * 1024) {
      alert("File terlalu besar! Maksimal 50MB ya.");
      return;
    }
    setFile(f);
  }, []);

  const dotStr = ".".repeat(loadingDot);
  const canSend = isLoading ? false : file ? true : text.trim().length > 0;
  const charCount = text.length;
  const tokenEst = estimateTokens(text);

  // Deep Space Cyber palette
  const C  = "#00D4FF";
  const CA = (a: number) => `rgba(0,212,255,${a})`;
  const V  = "#8B5CF6";
  const VA = (a: number) => `rgba(139,92,246,${a})`;
  const G  = "#00FF94";

  const modeColor = isCoding ? G : intent === "image" || intent === "img2img" ? V : C;
  const borderColor = focused
    ? `${modeColor}55`
    : dragging
      ? `${modeColor}70`
      : isLoading
        ? CA(0.18)
        : CA(0.12);

  const getAttachModeLabel = () => {
    if (!file) return null;
    const isImg = isImageFile(file);
    if (isImg) {
      return [
        { id: "vision" as AttachMode, icon: "👁", label: "LIHAT" },
        { id: "img2img" as AttachMode, icon: "🎨", label: "REMIX" },
      ];
    }
    return [
      { id: "analyze" as AttachMode, icon: "📄", label: "ANALISIS" },
      { id: "learn" as AttachMode, icon: "📚", label: "PELAJARI" },
    ];
  };

  const intentLabel = isCoding
    ? { icon: "⌥", text: "CODING MODE", color: G }
    : recording
      ? { icon: "🎙", text: "RECORDING...", color: "#FF006E" }
      : transcribing
        ? { icon: "◌", text: "TRANSKRIPSI...", color: C }
        : intent === "image"
          ? { icon: "🎨", text: "GENERATE GAMBAR", color: V }
          : intent === "img2img"
            ? { icon: "🖼", text: "IMAGE-TO-IMAGE", color: V }
            : intent === "file"
              ? { icon: "📎", text: attachMode === "learn" ? "PELAJARI FILE" : attachMode === "vision" ? "VISION MODE" : attachMode === "img2img" ? "IMG2IMG MODE" : "ANALISIS FILE", color: attachMode === "learn" ? G : C }
              : fileContextName
                ? { icon: "📚", text: `CONTEXT: ${fileContextName.slice(0, 20)}`, color: G }
                : { icon: "◈", text: "CHAT MODE", color: C };

  const attachModes = getAttachModeLabel();

  return (
    <div
      style={{
        borderTop: `1px solid ${CA(0.08)}`,
        background: "rgba(1,8,20,0.97)",
        backdropFilter: "blur(24px)",
        padding: "10px 14px 14px",
        position: "relative",
      }}
    >
      {/* Loading progress bar */}
      {isLoading && (
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent, ${modeColor}, ${modeColor === C ? V : C}, transparent)`,
            animation: "scan-horizontal 1.5s linear infinite",
          }}
        />
      )}

      {/* File context badge */}
      {fileContextName && !file && (
        <div style={{
          padding: "6px 12px", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(0,255,148,0.05)",
          border: "1px solid rgba(0,255,148,0.2)", borderRadius: 8,
        }}>
          <span style={{ fontSize: 12 }}>📚</span>
          <span style={{ color: G, fontSize: 11, fontFamily: "var(--app-font-mono)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Konteks aktif: {fileContextName}
          </span>
          {onClearContext && (
            <button
              onClick={onClearContext}
              style={{ background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.3)", borderRadius: 5, color: "#FF006E", padding: "1px 7px", fontSize: 10, cursor: "pointer" }}
            >
              ✕ Hapus
            </button>
          )}
        </div>
      )}

      {/* File preview strip */}
      {file && (
        <div
          className={`file-drop-zone ${dragging ? "dragover" : ""}`}
          style={{ padding: "10px 14px", marginBottom: 9 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {imgPreviewUrl ? (
              <img src={imgPreviewUrl} alt="preview" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: `1px solid ${VA(0.4)}`, flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: 20, flexShrink: 0 }}>📄</span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: G, fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.name}
              </div>
              <div style={{ color: CA(0.38), fontSize: 10 }}>
                {(file.size / 1024).toFixed(1)} KB
                {attachMode === "learn" ? " • Akan dipelajari & dihafal AI" : attachMode === "vision" ? " • AI akan analisis gambar" : attachMode === "img2img" ? " • Gambar referensi untuk remix" : " • Siap dianalisis"}
              </div>
            </div>
            <button
              onClick={() => setFile(null)}
              style={{ background: "rgba(255,0,110,0.1)", border: "1px solid rgba(255,0,110,0.3)", borderRadius: 6, color: "#FF006E", padding: "2px 8px", fontSize: 11, cursor: "pointer", flexShrink: 0 }}
            >
              ✕
            </button>
          </div>

          {/* Mode selector for file */}
          {attachModes && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {attachModes.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setAttachMode(m.id)}
                  style={{
                    padding: "3px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer",
                    fontFamily: "var(--app-font-mono)", letterSpacing: "0.06em",
                    border: attachMode === m.id ? `1px solid ${CA(0.5)}` : `1px solid ${CA(0.15)}`,
                    background: attachMode === m.id ? CA(0.1) : "transparent",
                    color: attachMode === m.id ? C : CA(0.38),
                    transition: "all 0.15s",
                    boxShadow: attachMode === m.id ? `0 0 10px ${CA(0.2)}` : "none",
                  }}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Drop zone overlay */}
      {!file && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          style={{
            position: "absolute", inset: 0,
            pointerEvents: dragging ? "auto" : "none",
            border: dragging ? `2px dashed ${modeColor}` : "none",
            borderRadius: 12,
            background: dragging ? `${modeColor}08` : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: dragging ? 10 : -1,
          }}
        >
          {dragging && (
            <div style={{ fontSize: 13, color: modeColor, fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", textShadow: `0 0 14px ${modeColor}` }}>
              ⬇ Drop file di sini
            </div>
          )}
        </div>
      )}

      {/* Intent label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontFamily: "var(--app-font-mono)", color: intentLabel.color, letterSpacing: "0.07em", opacity: 0.9, textShadow: `0 0 8px ${intentLabel.color}` }}>
          <span>{intentLabel.icon}</span>
          <span>{intentLabel.text}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontFamily: "var(--app-font-mono)", color: CA(0.28), letterSpacing: "0.06em" }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: isLoading || recording ? modeColor : G,
            boxShadow: `0 0 8px ${isLoading || recording ? modeColor : G}`,
            animation: "blink 1s step-end infinite",
          }} />
          {isLoading ? `MEMPROSES${dotStr}` : recording ? "MEREKAM" : transcribing ? "TRANSKRIPSI" : "SIAP"}
        </div>
      </div>

      {/* Main input row */}
      <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
        {/* File attach button */}
        <button
          onClick={() => fileRef.current?.click()}
          title="Attach file (semua tipe)"
          style={{
            width: 38, height: 38, borderRadius: 10,
            border: `1px solid ${file ? CA(0.5) : CA(0.14)}`,
            background: file ? CA(0.1) : "rgba(0,0,0,0.4)",
            color: file ? C : CA(0.4),
            fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "all 0.2s", marginBottom: 4,
            boxShadow: file ? `0 0 12px ${CA(0.2)}` : "none",
          }}
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          style={{ display: "none" }}
          accept="*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />

        {/* Textarea */}
        <div
          style={{
            flex: 1, position: "relative",
            border: `1px solid ${borderColor}`,
            borderRadius: 13, transition: "border-color 0.2s, box-shadow 0.2s",
            boxShadow: focused ? `0 0 18px ${modeColor}18, 0 0 4px ${modeColor}10` : "none",
            background: "rgba(0,5,15,0.5)",
          }}
        >
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={handleKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              recording
                ? "Sedang merekam... tekan mic untuk berhenti"
                : transcribing
                  ? "Sedang transkripsi suara..."
                  : file && attachMode === "vision"
                    ? "Tanya atau instruksikan tentang gambar ini..."
                    : file && attachMode === "img2img"
                      ? "Deskripsikan gambar yang diinginkan dari referensi ini..."
                      : file && attachMode === "learn"
                        ? "Siap! Tekan kirim untuk mempelajari file."
                        : file
                          ? "Instruksi untuk file (opsional)..."
                          : isCoding
                            ? "Tanya soal code, debugging, arsitektur..."
                            : "Ketik atau drop file... (Enter kirim, Shift+Enter baris baru)"
            }
            rows={1}
            style={{
              width: "100%", resize: "none", borderRadius: 13, border: "none",
              padding: "11px 42px 11px 14px", fontSize: 14, lineHeight: 1.5,
              fontFamily: "var(--app-font-sans)", minHeight: 46, maxHeight: 160,
              overflow: "auto", background: "transparent", color: "#d0eeff", outline: "none",
            }}
          />
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, pointerEvents: "none", opacity: 0.3, color: modeColor }}>
            {intent === "image" || intent === "img2img" ? "🎨" : isCoding ? "⌥" : file ? "📎" : "◈"}
          </div>
        </div>

        {/* Mic button */}
        <button
          onClick={toggleMic}
          disabled={isLoading}
          title={recording ? "Berhenti rekam" : "Rekam suara"}
          style={{
            width: 38, height: 38, borderRadius: 10,
            border: `1px solid ${recording ? "rgba(255,0,110,0.6)" : transcribing ? CA(0.4) : CA(0.14)}`,
            background: recording ? "rgba(255,0,110,0.12)" : transcribing ? CA(0.07) : "rgba(0,0,0,0.4)",
            color: recording ? "#FF006E" : transcribing ? C : CA(0.4),
            fontSize: 16, cursor: isLoading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "all 0.2s",
            animation: recording ? "glow-pulse 0.8s ease-in-out infinite" : "none",
            marginBottom: 4, opacity: isLoading ? 0.4 : 1,
            boxShadow: recording ? "0 0 16px rgba(255,0,110,0.3)" : "none",
          }}
        >
          {transcribing ? "◌" : recording ? "⏹" : "🎤"}
        </button>

        {/* Stop / Send button */}
        {isLoading ? (
          <button
            onClick={onStop}
            style={{
              width: 42, height: 42, borderRadius: 12,
              border: "1px solid rgba(255,0,110,0.5)",
              background: "rgba(255,0,110,0.1)", color: "#FF006E",
              fontSize: 17, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s", flexShrink: 0,
              animation: "violet-glow-pulse 1s ease-in-out infinite", marginBottom: 4,
              boxShadow: "0 0 16px rgba(255,0,110,0.25)",
            }}
          >
            ⏹
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="btn-send"
            style={{
              width: 42, height: 42, borderRadius: 12, fontSize: 17,
              cursor: canSend ? "pointer" : "not-allowed",
              opacity: canSend ? 1 : 0.3,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, marginBottom: 4,
            }}
          >
            ➤
          </button>
        )}
      </div>

      {/* Bottom stats bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, padding: "0 2px" }}>
        <div style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: CA(0.16), letterSpacing: "0.05em" }}>
          📎 semua file • 🎤 suara • Enter kirim
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9, fontFamily: "var(--app-font-mono)", color: CA(0.22), letterSpacing: "0.05em" }}>
          {charCount > 0 && (
            <>
              <span style={{ color: charCount > 3000 ? "#FF006E" : CA(0.38) }}>{charCount} chr</span>
              <span style={{ color: CA(0.28) }}>~{tokenEst} tok</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
