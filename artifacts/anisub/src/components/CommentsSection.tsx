import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, RefreshCw } from "lucide-react";
import { fetchComments, postComment, hasFirebase, type Comment } from "@/lib/comments";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} hari lalu`;
  return new Date(ts).toLocaleDateString("id-ID");
}

function Avatar({ name }: { name: string }) {
  const ch = (name || "A")[0].toUpperCase();
  const colors = ["#FF6B00","#A78BFA","#00C9FF","#34D399","#F472B6","#FFD700"];
  const col = colors[ch.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
      background: col + "22", border: `2px solid ${col}44`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, fontWeight: 800, color: col,
    }}>{ch}</div>
  );
}

export default function CommentsSection({ animeId }: { animeId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem("lawnime_username") || "");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const firebase = hasFirebase();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    if (!firebase) return;
    setLoading(true);
    try {
      const data = await fetchComments(animeId);
      setComments(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, animeId]);

  const handlePost = async () => {
    if (!name.trim()) { setError("Isi nama dulu ya!"); return; }
    if (!text.trim()) { setError("Komentar tidak boleh kosong."); return; }
    if (text.trim().length < 2) { setError("Komentar terlalu pendek."); return; }
    setError("");
    setPosting(true);
    try {
      const ok = await postComment(animeId, name.trim(), text.trim());
      if (ok) {
        localStorage.setItem("lawnime_username", name.trim());
        setText("");
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        await load();
      } else {
        setError("Gagal kirim komentar. Coba lagi.");
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <section style={{ marginTop: 4 }}>
      {/* Header toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: "#0f0f1b", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle size={16} style={{ color: "#A78BFA" }} />
          <span className="text-sm font-bold text-white">Komentar</span>
          {comments.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA" }}>
              {comments.length}
            </span>
          )}
        </div>
        <span style={{ color: "#6E6E90", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {/* Comment form */}
          {firebase ? (
            <div className="rounded-xl p-4 space-y-3"
              style={{ background: "#0f0f1b", border: "1px solid rgba(167,139,250,0.15)" }}>
              <p className="text-xs font-bold" style={{ color: "#A78BFA" }}>Tulis Komentar</p>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nama kamu..."
                maxLength={40}
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Tulis pendapatmu tentang anime ini..."
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none resize-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              {error && <p className="text-xs" style={{ color: "#FF4444" }}>{error}</p>}
              {success && <p className="text-xs" style={{ color: "#34D399" }}>✅ Komentar terkirim!</p>}
              <button
                onClick={handlePost}
                disabled={posting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all active:scale-95"
                style={{
                  background: posting ? "rgba(167,139,250,0.3)" : "linear-gradient(135deg,#7c3aed,#a78bfa)",
                  color: "#fff", opacity: posting ? 0.7 : 1,
                }}
              >
                <Send size={13} />
                {posting ? "Mengirim..." : "Kirim"}
              </button>
            </div>
          ) : (
            <div className="rounded-xl p-4 text-center"
              style={{ background: "#0f0f1b", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-sm" style={{ color: "#6E6E90" }}>💬 Komentar tidak tersedia di versi ini</p>
            </div>
          )}

          {/* Comments list */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold" style={{ color: "#6E6E90" }}>
              {comments.length > 0 ? `${comments.length} komentar` : "Belum ada komentar"}
            </p>
            {firebase && (
              <button onClick={load} disabled={loading}
                className="flex items-center gap-1 text-xs"
                style={{ color: "#6E6E90" }}>
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            )}
          </div>

          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "#161625" }} />
              ))}
            </div>
          )}

          {!loading && comments.length === 0 && firebase && (
            <div className="rounded-xl p-5 text-center" style={{ background: "#0f0f1b" }}>
              <p className="text-sm" style={{ color: "#6E6E90" }}>Belum ada komentar. Jadi yang pertama!</p>
            </div>
          )}

          {!loading && comments.map((c) => (
            <div key={c.id} className="flex gap-3 rounded-xl p-3"
              style={{ background: "#0f0f1b", border: "1px solid rgba(255,255,255,0.05)" }}>
              <Avatar name={c.name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white truncate">{c.name}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: "#6E6E90" }}>{timeAgo(c.ts)}</span>
                </div>
                <p className="text-sm mt-1 leading-relaxed" style={{ color: "#a0a0b8", wordBreak: "break-word" }}>
                  {c.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
