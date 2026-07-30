import { useState, useEffect, useCallback } from "react";
import { EmailTemplate } from "../types";
import { EMAIL_TEMPLATES } from "../data/templates";
import { CreateTemplateModal } from "./CreateTemplateModal";
import { INDONESIAN_NAMES } from "../data/names";

interface Props {
  selected: EmailTemplate | null;
  onSelect: (t: EmailTemplate) => void;
  targetNumber: string;
  senderEmail?: string;
}

function interpolate(html: string, vars: Record<string, string>) {
  return html.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function loadCustomTemplates(): EmailTemplate[] {
  try {
    return JSON.parse(localStorage.getItem("fix-merah-custom-templates") || "[]");
  } catch {
    return [];
  }
}

export function TemplateSelector({ selected, onSelect, targetNumber, senderEmail }: Props) {
  const [preview, setPreview] = useState<EmailTemplate | null>(null);
  const [customTemplates, setCustomTemplates] = useState<EmailTemplate[]>(loadCustomTemplates);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmailTemplate | null>(null);

  const refresh = useCallback(() => setCustomTemplates(loadCustomTemplates()), []);

  // Reload when modal closes
  useEffect(() => {
    if (!modalOpen) refresh();
  }, [modalOpen, refresh]);

  const previewName = INDONESIAN_NAMES[Math.floor(Math.random() * INDONESIAN_NAMES.length)];
  const vars = {
    nomor: targetNumber || "+62xxx-xxxx-xxxx",
    tanggal: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }),
    emailPengirim: senderEmail || "pengirim@gmail.com",
    namaPengirim: previewName,
  };

  function openCreate() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(e: React.MouseEvent, t: EmailTemplate) {
    e.stopPropagation();
    setEditTarget(t);
    setModalOpen(true);
  }

  function deleteCustom(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm("Hapus template ini?")) return;
    const updated = customTemplates.filter((t) => t.id !== id);
    localStorage.setItem("fix-merah-custom-templates", JSON.stringify(updated));
    setCustomTemplates(updated);
    if (selected?.id === id) onSelect(EMAIL_TEMPLATES[0]);
    if (preview?.id === id) setPreview(null);
  }

  function handleSave(t: EmailTemplate) {
    refresh();
    onSelect(t);
  }

  const allTemplates = [...EMAIL_TEMPLATES, ...customTemplates];

  return (
    <>
      <CreateTemplateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        editTemplate={editTarget}
        targetNumber={targetNumber}
        senderEmail={senderEmail}
      />

      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-bold" style={{ color: "#a855f7" }}>📄 Pilih Template Email</span>
          <div className="flex items-center gap-2">
            {selected && (
              <span className="neon-badge" style={{ background: "#a855f712", border: "1px solid #a855f730", color: "#a855f7" }}>
                {selected.icon} {selected.name}
              </span>
            )}
            {/* Buat Template button */}
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: "linear-gradient(135deg,#a855f722,#7c3aed22)",
                border: "1px solid #a855f750",
                color: "#c084fc",
                boxShadow: "0 0 12px #a855f715",
              }}
            >
              <span style={{ fontSize: 11 }}>✦</span> Buat Template
            </button>
          </div>
        </div>

        {/* Template list */}
        <div className="space-y-2 max-h-[480px] overflow-y-auto scrollbar-thin pr-1">
          {allTemplates.map((t) => {
            const isSelected = selected?.id === t.id;
            const isPreview = preview?.id === t.id;
            const isCustom = !EMAIL_TEMPLATES.find((bt) => bt.id === t.id);
            return (
              <div
                key={t.id}
                className="rounded-xl overflow-hidden transition-all cursor-pointer"
                style={{
                  border: `1px solid ${isSelected ? t.color : t.color + "25"}`,
                  boxShadow: isSelected ? `0 0 16px ${t.color}15` : undefined,
                  background: isSelected ? `${t.color}08` : "rgba(13,5,32,0.8)",
                }}
                onClick={() => onSelect(t)}
              >
                <div className="flex items-center gap-3 p-3">
                  {/* Radio indicator */}
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                    style={{ borderColor: isSelected ? t.color : t.color + "40" }}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full" style={{ background: t.color }} />}
                  </div>

                  <span className="text-lg shrink-0">{t.icon}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isCustom ? (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `${t.color}20`, color: t.color, border: `1px solid ${t.color}40` }}
                        >
                          KUSTOM
                        </span>
                      ) : (
                        <span className="text-[12px] font-bold" style={{ color: t.color }}>{t.id}</span>
                      )}
                      <span className="text-[12px] truncate" style={{ color: "#c4b5fd" }}>{t.name}</span>
                    </div>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: "#7c5fa0" }}>{t.description}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* View preview */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreview(isPreview ? null : t); }}
                      className="text-[10px] font-mono px-2 py-1 rounded transition-colors"
                      style={{
                        color: t.color,
                        border: `1px solid ${t.color}35`,
                        background: isPreview ? `${t.color}18` : "transparent",
                      }}
                    >
                      {isPreview ? "[HIDE]" : "[VIEW]"}
                    </button>

                    {/* Edit (custom only) */}
                    {isCustom && (
                      <button
                        onClick={(e) => openEdit(e, t)}
                        className="text-[10px] font-mono px-2 py-1 rounded transition-colors"
                        style={{
                          color: "#f97316",
                          border: "1px solid #f9731635",
                          background: "transparent",
                        }}
                        title="Edit template"
                      >
                        ✏️
                      </button>
                    )}

                    {/* Delete (custom only) */}
                    {isCustom && (
                      <button
                        onClick={(e) => deleteCustom(e, t.id)}
                        className="text-[10px] font-mono px-2 py-1 rounded transition-colors"
                        style={{
                          color: "#ef4444",
                          border: "1px solid #ef444435",
                          background: "transparent",
                        }}
                        title="Hapus template"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>

                {/* Preview iframe */}
                {isPreview && (
                  <div className="animate-appear" style={{ borderTop: `1px solid ${t.color}20` }}>
                    <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: "rgba(0,0,0,0.3)" }}>
                      <span className="text-[9px] font-mono" style={{ color: t.color + "60" }}>
                        // HTML Preview — {isCustom ? "Template Kustom" : `Template ${t.id}`}: {t.name}
                      </span>
                    </div>
                    <div className="bg-white overflow-hidden" style={{ height: 220 }}>
                      <iframe
                        srcDoc={interpolate(t.htmlBody, vars)}
                        className="w-full h-full border-0"
                        sandbox="allow-same-origin"
                        title={`Preview ${t.name}`}
                        style={{ transform: "scale(0.58)", transformOrigin: "top left", width: "172%", height: "172%" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty custom hint */}
          {customTemplates.length === 0 && (
            <div
              className="rounded-xl p-4 text-center cursor-pointer transition-all"
              style={{
                border: "1px dashed #a855f730",
                background: "rgba(168,85,247,0.03)",
              }}
              onClick={openCreate}
            >
              <p className="text-[11px]" style={{ color: "#7c5fa0" }}>
                ✦ Klik <strong style={{ color: "#c084fc" }}>Buat Template</strong> untuk membuat template email kustom kamu sendiri
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
