import { useState } from "react";
import { GmailAccount } from "../types";
import { addGmailAccount, deleteGmailAccount } from "../lib/api";

interface Props {
  accounts: GmailAccount[];
  onAccountsChange: (accounts: GmailAccount[]) => void;
  onLog: (type: string, message: string) => void;
}

export function GmailManager({ accounts, onAccountsChange, onLog }: Props) {
  const [form, setForm] = useState({ email: "", appPassword: "", label: "" });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [addStage, setAddStage] = useState<"" | "smtp" | "imap" | "done">("");
  const [showForm, setShowForm] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.appPassword) return;
    setAdding(true);
    setAddError("");
    setAddStage("smtp");
    onLog("info", `Memverifikasi SMTP: ${form.email}...`);
    try {
      const result = await addGmailAccount({
        email: form.email.trim().toLowerCase(),
        appPassword: form.appPassword,
        label: form.label || undefined,
      });
      setAddStage("done");
      const newAccount: GmailAccount = {
        id: result.id,
        email: result.email,
        appPassword: form.appPassword,
        label: result.label || undefined,
        selected: true,
        status: "idle",
      };
      onAccountsChange([...accounts, newAccount]);
      setForm({ email: "", appPassword: "", label: "" });
      setShowForm(false);
      setAddStage("");
      onLog("success", `✓ ${result.email} — SMTP & IMAP terverifikasi, akun aktif permanen!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAddError(msg.replace(/^(Error: )+/, ""));
      setAddStage("");
      onLog("error", `✗ Gagal: ${msg}`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string, email: string) {
    try {
      await deleteGmailAccount(id);
      onAccountsChange(accounts.filter((a) => a.id !== id));
      onLog("warn", `Gmail dihapus: ${email}`);
    } catch {}
  }

  function toggleSelect(id: string) {
    onAccountsChange(accounts.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a)));
  }

  const selectedCount = accounts.filter((a) => a.selected).length;
  const stageLabel: Record<string, string> = { smtp: "Testing SMTP...", imap: "Testing IMAP...", done: "Menyimpan..." };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm" style={{ color: "#a855f7" }}>📧 Gmail Accounts</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono" style={{ background: "#a855f720", border: "1px solid #a855f740", color: "#a855f7" }}>
            {selectedCount}/{accounts.length}
          </span>
          <span className="hidden sm:inline px-2 py-0.5 rounded text-[9px] font-mono" style={{ background: "#22d3ee08", border: "1px solid #22d3ee25", color: "#22d3ee70" }}>
            🔐 Tersimpan Permanen
          </span>
        </div>
        <div className="flex gap-2 items-center">
          {accounts.length > 0 && (
            <>
              <button onClick={() => onAccountsChange(accounts.map((a) => ({ ...a, selected: true })))}
                className="text-[10px] font-mono" style={{ color: "#22d3ee" }}>[ALL]</button>
              <button onClick={() => onAccountsChange(accounts.map((a) => ({ ...a, selected: false })))}
                className="text-[10px] font-mono" style={{ color: "#6b5fa0" }}>[NONE]</button>
            </>
          )}
          <button
            onClick={() => { setShowForm(!showForm); setAddError(""); }}
            className="px-3 py-1 rounded text-[11px] font-mono transition-colors"
            style={{ background: "#a855f718", border: "1px solid #a855f750", color: "#a855f7" }}
          >
            {showForm ? "— CANCEL" : "+ ADD"}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleAdd} className="rounded-lg p-4 space-y-3" style={{ background: "#0d0520", border: "1px solid #22d3ee30" }}>
          <div className="text-[11px] font-bold font-mono" style={{ color: "#22d3ee" }}>
            // Tambah Akun Gmail — <span style={{ color: "#a855f7" }}>Koneksi akan diverifikasi secara nyata</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wide" style={{ color: "#9d8abf" }}>Email Gmail *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contoh@gmail.com"
                required
                disabled={adding}
                className="w-full mt-1 rounded px-3 py-2 text-[12px] font-mono outline-none transition-colors disabled:opacity-50"
                style={{ background: "#06000f", border: "1px solid #a855f740", color: "#ffffff", fontSize: "13px" }}
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wide" style={{ color: "#9d8abf" }}>
                Label <span className="normal-case" style={{ color: "#6b5fa0" }}>(opsional)</span>
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="cth: Akun Utama"
                disabled={adding}
                className="w-full mt-1 rounded px-3 py-2 text-[12px] font-mono outline-none transition-colors disabled:opacity-50"
                style={{ background: "#06000f", border: "1px solid #a855f740", color: "#ffffff", fontSize: "13px" }}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono uppercase tracking-wide" style={{ color: "#9d8abf" }}>
              App Password * <span className="normal-case font-bold" style={{ color: "#f97316" }}>⚠ bukan password Gmail biasa!</span>
            </label>
            <input
              type="text"
              value={form.appPassword}
              onChange={(e) => setForm({ ...form, appPassword: e.target.value })}
              placeholder="xxxx xxxx xxxx xxxx  (boleh ada spasi)"
              required
              disabled={adding}
              className="w-full mt-1 rounded px-3 py-2 text-[12px] font-mono outline-none transition-colors disabled:opacity-50"
              style={{ background: "#06000f", border: "1px solid #a855f740", color: "#ffffff", fontSize: "13px" }}
            />
            <div className="mt-1 text-[10px] font-mono leading-relaxed" style={{ color: "#6b5fa0" }}>
              → Buat App Password: myaccount.google.com → Security → 2-Step Verification → App Passwords<br />
              → Pilih app "Mail", copy kode 16 karakter (spasi otomatis dihapus sistem)
            </div>
          </div>

          {adding && (
            <div className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ background: "#06000f", border: "1px solid #22d3ee30" }}>
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin shrink-0" style={{ borderColor: "#22d3ee", borderTopColor: "transparent" }} />
              <div className="text-[11px] font-mono">
                <span style={{ color: "#22d3ee" }}>{stageLabel[addStage] ?? "Memverifikasi..."}</span>
                <span className="ml-2" style={{ color: "#6b5fa0" }}>Testing SMTP & IMAP connection ke Gmail...</span>
              </div>
            </div>
          )}

          {addError && (
            <div className="flex gap-2 items-start py-2 px-3 rounded-lg" style={{ background: "#ff205010", border: "1px solid #ff205040" }}>
              <span className="text-sm shrink-0" style={{ color: "#ff2050" }}>✗</span>
              <div className="text-[11px] font-mono leading-relaxed" style={{ color: "#ff2050" }}>{addError}</div>
            </div>
          )}

          <button
            type="submit"
            disabled={adding || !form.email || !form.appPassword}
            className="w-full py-2.5 font-bold text-[12px] font-mono rounded-lg transition-colors disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff" }}
          >
            {adding ? (stageLabel[addStage] ?? "Verifying...") : "✓ VERIFIKASI & TAMBAH AKUN"}
          </button>
        </form>
      )}

      {/* Empty state */}
      {accounts.length === 0 && !showForm && (
        <div className="text-center py-10 text-[12px] font-mono rounded-lg" style={{ color: "#6b5fa0", border: "1px dashed #a855f720" }}>
          Belum ada akun Gmail.<br />
          <span className="text-[10px]" style={{ color: "#5a4a80" }}>Klik [+ ADD] untuk menambah dan memverifikasi akun.</span>
        </div>
      )}

      {/* Account list */}
      <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="group flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all"
            style={account.selected
              ? { background: "#a855f710", border: "1px solid #a855f740" }
              : { background: "#0d0520", border: "1px solid #2a1a40", opacity: 0.6 }
            }
            onClick={() => toggleSelect(account.id)}
          >
            {/* Checkbox */}
            <div className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
              style={account.selected
                ? { background: "#a855f7", borderColor: "#a855f7" }
                : { borderColor: "#a855f740" }
              }
            >
              {account.selected && <span className="text-white text-[9px] font-bold">✓</span>}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-mono truncate" style={{ color: "#e2d9ff" }}>{account.email}</span>
                {account.label && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0" style={{ color: "#22d3ee", background: "#22d3ee15", border: "1px solid #22d3ee30" }}>
                    {account.label}
                  </span>
                )}
                <span className="text-[9px] font-mono shrink-0" style={{ color: "#a855f7" }}>● VERIFIED</span>
              </div>
              <div className="text-[10px] font-mono mt-0.5">
                {account.status === "sending" && <span className="animate-pulse" style={{ color: "#fbbf24" }}>⟳ Mengirim...</span>}
                {account.status === "sent"    && <span style={{ color: "#a855f7" }}>✓ Terkirim</span>}
                {account.status === "error"   && <span style={{ color: "#ff2050" }}>✗ Error</span>}
                {account.status === "idle"    && <span style={{ color: "#6b5fa0" }}>Siap • SMTP+IMAP OK</span>}
              </div>
            </div>

            {/* Delete */}
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(account.id, account.email); }}
              className="shrink-0 text-[11px] font-mono px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: "#ff2050" }}
            >
              [DEL]
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
