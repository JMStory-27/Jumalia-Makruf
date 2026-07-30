import { useState, useEffect, useRef } from "react";
import { EmailTemplate } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (t: EmailTemplate) => void;
  editTemplate?: EmailTemplate | null;
  targetNumber?: string;
  senderEmail?: string;
}

const PRESET_COLORS = [
  "#00ff88", "#00d4ff", "#f97316", "#a855f7",
  "#ec4899", "#eab308", "#ef4444", "#06b6d4",
];

const PRESET_ICONS = [
  "✉️","📧","📨","📩","🛡️","⚡","🔥","💎",
  "🚀","🎯","📋","🔔","💼","🌟","⚖️","🔑",
];

function wrapPlainText(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#f5f5f5;padding:32px;color:#222;line-height:1.8}
  .card{background:#fff;border-radius:16px;padding:40px;max-width:680px;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,.1)}
  h2{color:#075E54;margin-bottom:24px;font-size:20px}
  p{font-size:15px;color:#333;margin-bottom:12px}
  .info{background:#f0fff8;border:1px solid #c8eed8;border-radius:10px;padding:20px;margin:20px 0}
  .info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #d4eedc}
  .info-row:last-child{border-bottom:none}
  .label{font-size:11px;font-weight:700;color:#6b8c7a;text-transform:uppercase}
  .value{font-size:14px;font-weight:700;color:#0a2418}
  .footer{margin-top:32px;padding-top:16px;border-top:1px dashed #e0e0e0;font-size:13px;color:#888}
</style>
</head><body>
<div class="card">
  <h2>📩 Permohonan Pemulihan Akun WhatsApp</h2>
  <div class="info">
    <div class="info-row"><span class="label">Nomor</span><span class="value">{nomor}</span></div>
    <div class="info-row"><span class="label">Tanggal</span><span class="value">{tanggal}</span></div>
    <div class="info-row"><span class="label">Email</span><span class="value">{emailPengirim}</span></div>
  </div>
  <div>${escaped}</div>
  <div class="footer">Dikirim oleh: {emailPengirim} | {tanggal}</div>
</div>
</body></html>`;
}

function interpolate(html: string, vars: Record<string, string>) {
  return html.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export function CreateTemplateModal({ open, onClose, onSave, editTemplate, targetNumber, senderEmail }: Props) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("✉️");
  const [color, setColor] = useState("#00ff88");
  const [subject, setSubject] = useState("");
  const [bodyMode, setBodyMode] = useState<"plain" | "html">("plain");
  const [body, setBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (editTemplate) {
      setName(editTemplate.name);
      setIcon(editTemplate.icon);
      setColor(editTemplate.color);
      setSubject(editTemplate.subject);
      setBody(editTemplate.htmlBody);
      setBodyMode("html");
    } else {
      setName(""); setIcon("✉️"); setColor("#00ff88");
      setSubject(""); setBody(""); setBodyMode("plain");
    }
    setShowPreview(false);
  }, [editTemplate, open]);

  if (!open) return null;

  const vars = {
    nomor: targetNumber || "+62xxx-xxxx-xxxx",
    tanggal: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }),
    emailPengirim: senderEmail || "pengirim@gmail.com",
  };

  const resolvedHtml = bodyMode === "plain" ? wrapPlainText(body) : body;
  const previewHtml = interpolate(resolvedHtml, vars);

  const canSave = name.trim() && subject.trim() && body.trim();

  function handleSave() {
    if (!canSave) return;
    const customTemplates: EmailTemplate[] = JSON.parse(
      localStorage.getItem("fix-merah-custom-templates") || "[]"
    );
    const existing = editTemplate
      ? customTemplates.findIndex((t) => t.id === editTemplate.id)
      : -1;

    const newTemplate: EmailTemplate = {
      id: editTemplate?.id ?? Date.now(),
      name: name.trim(),
      subject: subject.trim(),
      description: `Template kustom — ${bodyMode === "html" ? "HTML" : "Teks biasa"}`,
      color,
      icon,
      htmlBody: resolvedHtml,
    };

    if (existing >= 0) {
      customTemplates[existing] = newTemplate;
    } else {
      customTemplates.push(newTemplate);
    }
    localStorage.setItem("fix-merah-custom-templates", JSON.stringify(customTemplates));
    onSave(newTemplate);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(145deg,#0d0520,#130a30)",
          border: `1px solid ${color}40`,
          boxShadow: `0 0 60px ${color}18`,
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${color}20`, background: "rgba(0,0,0,0.3)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span className="font-bold text-sm" style={{ color }}>
              {editTemplate ? "Edit Template" : "Buat Template Baru"}
            </span>
          </div>
          <button onClick={onClose} className="text-lg opacity-50 hover:opacity-100 transition-opacity" style={{ color: "#c4b5fd" }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Name + Icon */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold mb-1.5 tracking-widest" style={{ color: `${color}90` }}>NAMA TEMPLATE</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Template Santai"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${color}30`,
                  color: "#e2d9f3",
                }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1.5 tracking-widest" style={{ color: `${color}90` }}>IKON</label>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_ICONS.map((em) => (
                  <button
                    key={em}
                    onClick={() => setIcon(em)}
                    className="w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all"
                    style={{
                      background: icon === em ? `${color}25` : "rgba(255,255,255,0.05)",
                      border: `1px solid ${icon === em ? color : "transparent"}`,
                    }}
                  >{em}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-[10px] font-bold mb-1.5 tracking-widest" style={{ color: `${color}90` }}>WARNA TEMA</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    background: c,
                    borderColor: color === c ? "#fff" : "transparent",
                    boxShadow: color === c ? `0 0 10px ${c}80` : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[10px] font-bold mb-1.5 tracking-widest" style={{ color: `${color}90` }}>
              SUBJECT EMAIL
              <span className="ml-2 opacity-60 font-normal normal-case">— gunakan {"{nomor}"} untuk nomor WA</span>
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Contoh: Appeal Akun WA | {nomor}"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${color}30`,
                color: "#e2d9f3",
              }}
            />
          </div>

          {/* Body mode tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold tracking-widest" style={{ color: `${color}90` }}>ISI EMAIL</label>
              <div className="flex gap-1">
                {(["plain", "html"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setBodyMode(m)}
                    className="text-[10px] font-mono px-3 py-1 rounded transition-all"
                    style={{
                      background: bodyMode === m ? `${color}22` : "rgba(255,255,255,0.05)",
                      border: `1px solid ${bodyMode === m ? color : "transparent"}`,
                      color: bodyMode === m ? color : "#7c5fa0",
                    }}
                  >
                    {m === "plain" ? "Teks Biasa" : "HTML"}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder={
                bodyMode === "plain"
                  ? "Tulis isi email di sini...\n\nGunakan {nomor}, {tanggal}, {emailPengirim} sebagai placeholder.\n\nContoh:\nKepada Tim WhatsApp,\nSaya ingin mengajukan permohonan pemulihan akun {nomor}..."
                  : "<!DOCTYPE html>\n<html>\n<body>\n  <p>Isi HTML email kamu di sini...</p>\n  <p>Gunakan {nomor}, {tanggal}, {emailPengirim}</p>\n</body>\n</html>"
              }
              className="w-full rounded-lg px-3 py-2.5 text-xs font-mono outline-none resize-none"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${color}25`,
                color: "#c4b5fd",
                lineHeight: 1.8,
              }}
            />
            <p className="text-[10px] mt-1.5 opacity-50" style={{ color: "#c4b5fd" }}>
              {bodyMode === "plain"
                ? "✍️ Teks biasa akan otomatis dibungkus HTML yang rapi"
                : "🧑‍💻 Tulis HTML penuh — bisa pakai CSS inline"}
            </p>
          </div>

          {/* Live Preview toggle */}
          {body.trim() && (
            <div>
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="text-[11px] font-mono px-3 py-1.5 rounded-lg transition-all mb-2"
                style={{
                  background: showPreview ? `${color}18` : "rgba(255,255,255,0.05)",
                  border: `1px solid ${color}35`,
                  color,
                }}
              >
                {showPreview ? "▲ Sembunyikan Preview" : "▼ Lihat Preview"}
              </button>

              {showPreview && (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${color}20` }}
                >
                  <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "rgba(0,0,0,0.4)" }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-[9px] font-mono" style={{ color: `${color}70` }}>
                      // Live Preview — {name || "Template Baru"}
                    </span>
                  </div>
                  <div className="bg-white overflow-hidden" style={{ height: 260 }}>
                    <iframe
                      ref={previewRef}
                      srcDoc={previewHtml}
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                      title="Preview template baru"
                      style={{ transform: "scale(0.58)", transformOrigin: "top left", width: "172%", height: "172%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 shrink-0"
          style={{ borderTop: `1px solid ${color}20`, background: "rgba(0,0,0,0.3)" }}
        >
          <p className="text-[10px] opacity-50" style={{ color: "#c4b5fd" }}>
            Template tersimpan di perangkat ini
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-[11px] px-4 py-2 rounded-lg transition-all"
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#7c5fa0",
                background: "transparent",
              }}
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="text-[11px] font-bold px-5 py-2 rounded-lg transition-all"
              style={{
                background: canSave ? `linear-gradient(135deg,${color}cc,${color}88)` : "rgba(255,255,255,0.05)",
                color: canSave ? "#000" : "#4a3060",
                cursor: canSave ? "pointer" : "not-allowed",
                border: `1px solid ${canSave ? color : "transparent"}`,
                boxShadow: canSave ? `0 4px 16px ${color}40` : undefined,
              }}
            >
              💾 Simpan Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
