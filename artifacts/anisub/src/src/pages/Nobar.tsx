'use client';
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useSearch } from "wouter";

// ── Firebase REST helpers ──────────────────────────────────────────────────────
function getDbUrl(): string {
  try {
    const cfg = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || "{}");
    return (cfg.databaseURL as string | undefined)?.replace(/\/$/, "") ?? "";
  } catch { return ""; }
}
const DB_URL = getDbUrl();

async function fbPatch(path: string, data: unknown) {
  if (!DB_URL) return;
  await fetch(`${DB_URL}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).catch(() => {});
}
async function fbSet(path: string, data: unknown) {
  if (!DB_URL) return;
  await fetch(`${DB_URL}/${path}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).catch(() => {});
}
async function fbGet<T>(path: string): Promise<T | null> {
  if (!DB_URL) return null;
  try {
    const r = await fetch(`${DB_URL}/${path}.json`);
    return r.json();
  } catch { return null; }
}
async function fbRemove(path: string) {
  if (!DB_URL) return;
  await fetch(`${DB_URL}/${path}.json`, { method: "DELETE" }).catch(() => {});
}

// ── WebRTC ─────────────────────────────────────────────────────────────────────
const ICE: RTCIceServer[] = [
  // ── STUN (Google + Cloudflare) ──
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.stunprotocol.org:3478" },
  // ── TURN gratis tanpa daftar (relay backup agar kamera/suara tidak putus) ──
  { urls: "turn:numb.viagenie.ca",           username: "webrtc@live.com",      credential: "muazkh" },
  { urls: "turn:openrelay.metered.ca:80",    username: "openrelayproject",      credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443",   username: "openrelayproject",      credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:relay.backups.cz",           username: "webrtc",               credential: "webrtc" },
];

function genId() { return Math.random().toString(36).slice(2, 9); }
function genCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

// ── Types ──────────────────────────────────────────────────────────────────────
interface PeerEntry { name: string; joined: number }
interface RoomData {
  host: string; created: number;
  anime?: AnimeRef;
  peers: Record<string, PeerEntry>;
  signals?: Record<string, SignalEntry>;
}
interface SignalEntry {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  offerCandidates?: Record<string, RTCIceCandidateInit>;
  answerCandidates?: Record<string, RTCIceCandidateInit>;
}
interface AnimeRef { id: string; title: string; episodeId?: string; epTitle?: string }
interface PeerState { userId: string; name: string; stream?: MediaStream }

// ── Draggable Cam Bubble ───────────────────────────────────────────────────────
function CamBubble({
  stream, label, muted: peerMuted, isMe, onClick,
  style,
}: {
  stream?: MediaStream; label: string; muted?: boolean;
  isMe?: boolean; onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const startPos = useRef({ mx: 0, my: 0, bx: 0, by: 0 });
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!elRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    const rect = elRef.current.getBoundingClientRect();
    startPos.current = { mx: e.clientX, my: e.clientY, bx: rect.left, by: rect.top };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !elRef.current) return;
    const dx = e.clientX - startPos.current.mx;
    const dy = e.clientY - startPos.current.my;
    posRef.current = { x: startPos.current.bx + dx, y: startPos.current.by + dy };
    elRef.current.style.left = posRef.current.x + "px";
    elRef.current.style.top = posRef.current.y + "px";
  };
  const onPointerUp = () => { dragging.current = false; };

  return (
    <div
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={() => { if (!dragging.current) onClick?.(); }}
      style={{
        width: 72, height: 72, borderRadius: "50%",
        overflow: "hidden", cursor: "grab",
        border: isMe ? "2px solid #60A5FA" : "2px solid rgba(255,255,255,0.25)",
        background: "#111",
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        position: "relative",
        flexShrink: 0,
        ...style,
      }}
    >
      {stream ? (
        <video
          ref={videoRef}
          autoPlay playsInline muted={isMe || peerMuted}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: isMe ? "scaleX(-1)" : "none" }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a2e" }}>
          <span style={{ fontSize: 28 }}>👤</span>
        </div>
      )}
      {/* Label */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        background: "rgba(0,0,0,0.6)", fontSize: 8, fontWeight: 700,
        color: "#fff", textAlign: "center", padding: "2px 0",
      }}>
        {isMe ? "Kamu" : label}
      </div>
      {peerMuted && (
        <div style={{ position: "absolute", top: 4, right: 4, fontSize: 10, background: "rgba(0,0,0,0.7)", borderRadius: "50%", padding: 2 }}>🔇</div>
      )}
    </div>
  );
}

// ── Fullscreen Video ──────────────────────────────────────────────────────────
function FullscreenCam({ stream, label, onClose }: { stream?: MediaStream; label: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#000", display: "flex", flexDirection: "column",
    }}>
      <video
        ref={videoRef}
        autoPlay playsInline
        style={{ flex: 1, width: "100%", objectFit: "cover" }}
      />
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        padding: "16px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{label}</span>
        <button onClick={onClose} style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.15)", border: "none",
          color: "#fff", fontSize: 18, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>✕</button>
      </div>
    </div>
  );
}

// ── NOBAR HOME ────────────────────────────────────────────────────────────────
function NobarHome({
  joinInput, setJoinInput, error, loading, initAnime,
  onCreate, onJoin,
}: {
  joinInput: string; setJoinInput: (v: string) => void;
  error: string; loading: boolean; initAnime?: AnimeRef;
  onCreate: () => void; onJoin: () => void;
}) {
  const [tab, setTab] = useState<"buat" | "gabung">("buat");

  return (
    <div style={{
      minHeight: "100dvh", background: "#05050f",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "60px 20px 100px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🍿</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", margin: 0 }}>NOBAR</h1>
        <p style={{ fontSize: 13, color: "#475569", margin: "6px 0 0" }}>Nonton Bareng sama temen · max 5 orang</p>
      </div>

      {/* Anime preview */}
      {initAnime && (
        <div style={{
          width: "100%", maxWidth: 360, marginBottom: 20,
          background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.2)",
          borderRadius: 14, padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>🎌</span>
          <div>
            <p style={{ margin: 0, fontSize: 10, color: "#FF6B00", fontWeight: 700 }}>NOBAR ANIME INI</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#fff", fontWeight: 700 }}>{initAnime.title}</p>
          </div>
        </div>
      )}

      {/* Tab */}
      <div style={{
        display: "flex", gap: 0, marginBottom: 24,
        background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4,
        width: "100%", maxWidth: 360,
      }}>
        {(["buat", "gabung"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 14,
            background: tab === t ? "linear-gradient(135deg,#667eea,#764ba2)" : "transparent",
            color: tab === t ? "#fff" : "#475569",
            transition: "all 0.2s",
          }}>
            {t === "buat" ? "🏠 Buat Room" : "🔗 Gabung Room"}
          </button>
        ))}
      </div>

      <div style={{ width: "100%", maxWidth: 360 }}>
        {tab === "buat" ? (
          <div>
            <p style={{ color: "#94A3B8", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
              Buat room baru dan bagikan kode 4 angka ke teman. Kamu akan jadi host yang bisa pilih anime.
            </p>
            <button
              onClick={onCreate} disabled={loading}
              style={{
                width: "100%", padding: "16px", borderRadius: 14, border: "none",
                background: loading ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#FF6B00,#FF4444)",
                color: "#fff", fontWeight: 900, fontSize: 16, cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 4px 20px rgba(255,107,0,0.35)",
              }}
            >
              {loading ? "⏳ Memulai..." : "🚀 Buat Room Sekarang"}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: "#94A3B8", fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              Masukkan kode 4 angka dari teman untuk bergabung ke room nobar.
            </p>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <input
                type="number" maxLength={4}
                placeholder="0000"
                value={joinInput}
                onChange={e => setJoinInput(e.target.value.slice(0, 4))}
                style={{
                  flex: 1, padding: "14px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 24,
                  fontWeight: 900, textAlign: "center", letterSpacing: "0.3em",
                  outline: "none",
                }}
              />
            </div>
            {error && (
              <p style={{ color: "#FF4444", fontSize: 12, marginBottom: 12, textAlign: "center" }}>⚠️ {error}</p>
            )}
            <button
              onClick={onJoin} disabled={loading || joinInput.length !== 4}
              style={{
                width: "100%", padding: "16px", borderRadius: 14, border: "none",
                background: loading || joinInput.length !== 4
                  ? "rgba(255,255,255,0.08)"
                  : "linear-gradient(135deg,#34D399,#22D3EE)",
                color: loading || joinInput.length !== 4 ? "#475569" : "#fff",
                fontWeight: 900, fontSize: 16,
                cursor: loading || joinInput.length !== 4 ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "⏳ Bergabung..." : "✅ Masuk Room"}
            </button>
          </div>
        )}
      </div>

      {!DB_URL && (
        <div style={{
          marginTop: 32, padding: "12px 16px", borderRadius: 12,
          background: "rgba(255,68,68,0.1)", border: "1px solid rgba(255,68,68,0.2)",
          color: "#FF6B6B", fontSize: 12, textAlign: "center", maxWidth: 360,
        }}>
          ⚠️ Firebase belum dikonfigurasi. NOBAR butuh VITE_FIREBASE_DATABASE_URL untuk signaling.
        </div>
      )}
    </div>
  );
}

// ── NOBAR ROOM ────────────────────────────────────────────────────────────────
function NobarRoom({
  code, isHost, myStream, muted, camOff, peers, roomAnime,
  fullscreenPeer, setFullscreenPeer,
  onMute, onCam, onLeave, onShareAnime,
}: {
  code: string; isHost: boolean;
  myStream: MediaStream | null; muted: boolean; camOff: boolean;
  peers: PeerState[]; roomAnime?: AnimeRef;
  fullscreenPeer: string | null; setFullscreenPeer: (id: string | null) => void;
  onMute: () => void; onCam: () => void; onLeave: () => void;
  onShareAnime: (a: AnimeRef) => void;
}) {
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const fsEntry = fullscreenPeer === "me"
    ? { stream: myStream || undefined, label: "Kamu" }
    : peers.find(p => p.userId === fullscreenPeer)
      ? { stream: peers.find(p => p.userId === fullscreenPeer)!.stream, label: peers.find(p => p.userId === fullscreenPeer)!.name }
      : null;

  return (
    <div style={{ minHeight: "100dvh", background: "#05050f", display: "flex", flexDirection: "column", paddingBottom: 80 }}>
      {/* Fullscreen overlay */}
      {fsEntry && (
        <FullscreenCam stream={fsEntry.stream} label={fsEntry.label} onClose={() => setFullscreenPeer(null)} />
      )}

      {/* Header */}
      <div style={{
        padding: "14px 16px 12px",
        background: "rgba(5,5,15,0.95)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 10, color: "#475569", fontWeight: 600 }}>NOBAR ROOM</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "0.15em" }}>
              {code}
            </span>
            <button onClick={copyCode} style={{
              padding: "3px 10px", borderRadius: 99,
              background: copied ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${copied ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)"}`,
              color: copied ? "#34D399" : "#94A3B8", fontSize: 10, fontWeight: 700, cursor: "pointer",
            }}>
              {copied ? "✓ Tersalin" : "📋 Salin"}
            </button>
          </div>
        </div>
        <button onClick={onLeave} style={{
          padding: "8px 14px", borderRadius: 10,
          background: "rgba(255,68,68,0.12)", border: "1px solid rgba(255,68,68,0.25)",
          color: "#FF6B6B", fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}>
          Keluar
        </button>
      </div>

      {/* Cam area */}
      <div style={{ padding: "16px 16px 8px" }}>
        <p style={{ margin: "0 0 10px", fontSize: 10, color: "#475569", fontWeight: 700 }}>
          📹 {1 + peers.length}/{5} PESERTA
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* My bubble */}
          <CamBubble
            stream={myStream || undefined}
            label="Kamu"
            muted={muted}
            isMe
            onClick={() => setFullscreenPeer("me")}
          />
          {/* Peer bubbles */}
          {peers.map(peer => (
            <CamBubble
              key={peer.userId}
              stream={peer.stream}
              label={peer.name}
              onClick={() => setFullscreenPeer(peer.userId)}
            />
          ))}
          {/* Empty slots */}
          {Array.from({ length: Math.max(0, 4 - peers.length) }).map((_, i) => (
            <div key={i} style={{
              width: 72, height: 72, borderRadius: "50%",
              border: "2px dashed rgba(255,255,255,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 22, opacity: 0.3 }}>👤</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: "0 16px 16px", display: "flex", gap: 10 }}>
        <CtrlBtn onClick={onMute} active={muted} emoji={muted ? "🔇" : "🎤"} label={muted ? "Bisu" : "Suara"} danger={muted} />
        <CtrlBtn onClick={onCam} active={camOff} emoji={camOff ? "📵" : "📷"} label={camOff ? "Cam Off" : "Cam On"} danger={camOff} />
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 16px" }} />

      {/* Anime section */}
      <div style={{ padding: "16px" }}>
        <p style={{ margin: "0 0 12px", fontSize: 10, color: "#475569", fontWeight: 700 }}>🎌 ANIME NOBAR</p>

        {roomAnime ? (
          <div style={{
            background: "rgba(255,107,0,0.07)", border: "1px solid rgba(255,107,0,0.2)",
            borderRadius: 14, padding: "14px 16px", marginBottom: 12,
          }}>
            <p style={{ margin: "0 0 2px", fontSize: 10, color: "#FF6B00", fontWeight: 700 }}>SEDANG DIPILIH</p>
            <p style={{ margin: "0 0 10px", fontSize: 15, color: "#fff", fontWeight: 800 }}>{roomAnime.title}</p>
            {roomAnime.epTitle && (
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#94A3B8" }}>Episode {roomAnime.epTitle}</p>
            )}
            <button
              onClick={() => roomAnime.episodeId ? setLocation(`/watch/${roomAnime.episodeId}`) : setLocation(`/anime/${roomAnime.id}`)}
              style={{
                width: "100%", padding: "12px", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg,#FF6B00,#FF4444)",
                color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
              }}
            >
              ▶ Tonton Sekarang
            </button>
          </div>
        ) : (
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)",
            borderRadius: 14, padding: "20px 16px", textAlign: "center", marginBottom: 12,
          }}>
            <p style={{ margin: "0 0 4px", fontSize: 14, color: "#475569" }}>Belum ada anime dipilih</p>
            <p style={{ margin: 0, fontSize: 11, color: "#374151" }}>
              {isHost ? "Kamu (host) bisa pilih anime di bawah" : "Tunggu host pilih anime"}
            </p>
          </div>
        )}

        {isHost && (
          <button
            onClick={() => setLocation("/search")}
            style={{
              width: "100%", padding: "13px", borderRadius: 12, border: "1px solid rgba(167,139,250,0.3)",
              background: "rgba(167,139,250,0.08)", color: "#A78BFA",
              fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            🔍 Cari & Pilih Anime
          </button>
        )}
      </div>

      {/* Invite info */}
      <div style={{ padding: "0 16px", marginTop: 4 }}>
        <div style={{
          background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)",
          borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>📨</span>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#60A5FA", fontWeight: 700 }}>AJAK TEMAN</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94A3B8" }}>Bagikan kode <strong style={{ color: "#fff" }}>{code}</strong> ke teman</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CtrlBtn({ onClick, active, emoji, label, danger }: { onClick: () => void; active: boolean; emoji: string; label: string; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "10px 0", borderRadius: 12, border: "none", cursor: "pointer",
      background: active && danger ? "rgba(255,68,68,0.15)" : "rgba(255,255,255,0.05)",
      color: active && danger ? "#FF6B6B" : "#94A3B8",
      fontWeight: 700, fontSize: 12,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      {label}
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function NobarPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const initAnime: AnimeRef | undefined = params.get("anime") ? {
    id: params.get("anime")!,
    title: decodeURIComponent(params.get("title") || ""),
    episodeId: params.get("episode") || undefined,
    epTitle: params.get("epTitle") ? decodeURIComponent(params.get("epTitle")!) : undefined,
  } : undefined;

  // ── State ──
  const [mode, setMode] = useState<"home" | "room">("home");
  const [roomCode, setRoomCode] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<PeerState[]>([]);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [fullscreenPeer, setFullscreenPeer] = useState<string | null>(null);
  const [roomAnime, setRoomAnime] = useState<AnimeRef | undefined>(initAnime);

  // ── Refs ──
  const uid = useRef(localStorage.getItem("nobar_uid") || genId());
  const myName = useRef("User" + uid.current.slice(0, 4));
  const pcMap = useRef(new Map<string, RTCPeerConnection>());
  const esRef = useRef<EventSource | null>(null);
  const codeRef = useRef("");
  const isHostRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const candidateQ = useRef(new Map<string, RTCIceCandidateInit[]>());

  useEffect(() => { localStorage.setItem("nobar_uid", uid.current); }, []);

  // ── Media ──
  const startMedia = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setMyStream(s); streamRef.current = s; return s;
    } catch {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        setMyStream(s); streamRef.current = s; return s;
      } catch { return null; }
    }
  }, []);

  // ── Create Peer Connection ──
  const createPC = useCallback((remoteId: string, localStream: MediaStream | null, isOfferer: boolean) => {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcMap.current.set(remoteId, pc);
    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.ontrack = ev => {
      const stream = ev.streams[0];
      setPeers(prev => {
        const exists = prev.find(p => p.userId === remoteId);
        if (exists) return prev.map(p => p.userId === remoteId ? { ...p, stream } : p);
        return [...prev, { userId: remoteId, name: "User" + remoteId.slice(0, 4), stream }];
      });
    };

    pc.oniceconnectionstatechange = () => {
      if ((pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") && pc.signalingState === "stable") {
        try { pc.restartIce?.(); } catch {}
      }
    };

    pc.onicecandidate = async ev => {
      if (!ev.candidate || !codeRef.current) return;
      const key = isOfferer ? `${uid.current}-${remoteId}` : `${remoteId}-${uid.current}`;
      const field = isOfferer ? "offerCandidates" : "answerCandidates";
      await fbPatch(`nobar/${codeRef.current}/signals/${key}/${field}`, {
        [Date.now() + Math.random()]: ev.candidate.toJSON(),
      });
    };

    return pc;
  }, []);

  // ── Drain ICE queue ──
  const drainQ = useCallback(async (pc: RTCPeerConnection, peerId: string) => {
    const q = candidateQ.current.get(peerId) || [];
    for (const c of q) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
    candidateQ.current.delete(peerId);
  }, []);

  // ── Handle signals for me ──
  const handleSig = useCallback(async (sigKey: string, sig: SignalEntry, localStream: MediaStream | null) => {
    const parts = sigKey.split("-");
    if (parts.length < 2) return;
    const from = parts[0], to = parts[1];
    const myId = uid.current;

    // I'm answerer — got offer
    if (to === myId && sig.offer && !pcMap.current.has(from)) {
      const pc = createPC(from, localStream, false);
      await pc.setRemoteDescription(new RTCSessionDescription(sig.offer));
      await drainQ(pc, from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await fbPatch(`nobar/${codeRef.current}/signals/${sigKey}`, { answer: { type: answer.type, sdp: answer.sdp } });
    }

    // I'm offerer — got answer
    if (from === myId && sig.answer) {
      const pc = pcMap.current.get(to);
      if (pc && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.answer));
        await drainQ(pc, to);
      }
    }

    // ICE candidates for me as answerer
    if (to === myId && sig.offerCandidates) {
      const pc = pcMap.current.get(from);
      for (const c of Object.values(sig.offerCandidates)) {
        try {
          if (pc?.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(c));
          else { const q = candidateQ.current.get(from) || []; q.push(c); candidateQ.current.set(from, q); }
        } catch {}
      }
    }

    // ICE candidates for me as offerer
    if (from === myId && sig.answerCandidates) {
      const pc = pcMap.current.get(to);
      for (const c of Object.values(sig.answerCandidates)) {
        try {
          if (pc?.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(c));
          else { const q = candidateQ.current.get(to) || []; q.push(c); candidateQ.current.set(to, q); }
        } catch {}
      }
    }
  }, [createPC, drainQ]);

  // ── Listen Firebase SSE ──
  const listenRoom = useCallback((code: string, localStream: MediaStream | null) => {
    if (!DB_URL) return;
    esRef.current?.close();
    const es = new EventSource(`${DB_URL}/nobar/${code}.json`);
    esRef.current = es;

    const processRoom = async (room: RoomData) => {
      if (!room) return;
      // Update peers list
      if (room.peers) {
        const pIds = Object.keys(room.peers).filter(id => id !== uid.current);
        setPeers(prev => pIds.map(id => ({
          userId: id,
          name: room.peers[id]?.name || "User" + id.slice(0, 4),
          stream: prev.find(p => p.userId === id)?.stream,
        })));

        // If I'm host, offer to new peers
        if (isHostRef.current) {
          for (const peerId of pIds) {
            if (!pcMap.current.has(peerId)) {
              const pc = createPC(peerId, localStream, true);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await fbPatch(`nobar/${code}/signals/${uid.current}-${peerId}`, { offer: { type: offer.type, sdp: offer.sdp } });
            }
          }
        }
      }
      if (room.anime) setRoomAnime(room.anime);
      if (room.signals) {
        for (const [k, v] of Object.entries(room.signals)) {
          await handleSig(k, v as SignalEntry, localStream);
        }
      }
    };

    es.addEventListener("put", async (ev: MessageEvent) => {
      try { const { data } = JSON.parse(ev.data); if (data) await processRoom(data); } catch {}
    });
    es.addEventListener("patch", async (ev: MessageEvent) => {
      try {
        const { path } = JSON.parse(ev.data);
        const room = await fbGet<RoomData>(`nobar/${code}`);
        if (room) await processRoom(room);
      } catch {}
    });
  }, [handleSig, createPC]);

  // ── Create room ──
  const handleCreate = async () => {
    setLoading(true); setError("");
    const code = genCode();
    const stream = await startMedia();
    codeRef.current = code; isHostRef.current = true;
    await fbSet(`nobar/${code}`, {
      host: uid.current, created: Date.now(),
      anime: initAnime || null,
      peers: { [uid.current]: { name: myName.current, joined: Date.now() } },
    });
    setRoomCode(code); setIsHost(true);
    if (initAnime) setRoomAnime(initAnime);
    setMode("room");
    listenRoom(code, stream);
    setLoading(false);
  };

  // ── Join room ──
  const handleJoin = async () => {
    const code = joinInput.trim();
    if (code.length !== 4) { setError("Kode harus 4 angka"); return; }
    setLoading(true); setError("");
    const room = await fbGet<RoomData>(`nobar/${code}`);
    if (!room) { setError("Room tidak ditemukan"); setLoading(false); return; }
    if (Object.keys(room.peers || {}).length >= 5) { setError("Room penuh (maks 5 orang)"); setLoading(false); return; }

    const stream = await startMedia();
    codeRef.current = code; isHostRef.current = false;
    await fbPatch(`nobar/${code}/peers`, { [uid.current]: { name: myName.current, joined: Date.now() } });

    // Offer to all existing peers
    for (const peerId of Object.keys(room.peers || {}).filter(id => id !== uid.current)) {
      const pc = createPC(peerId, stream, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await fbPatch(`nobar/${code}/signals/${uid.current}-${peerId}`, { offer: { type: offer.type, sdp: offer.sdp } });
    }

    if (room.anime) setRoomAnime(room.anime);
    setRoomCode(code); setIsHost(false);
    setMode("room");
    listenRoom(code, stream);
    setLoading(false);
  };

  // ── Leave ──
  const handleLeave = async () => {
    esRef.current?.close();
    pcMap.current.forEach(pc => pc.close());
    pcMap.current.clear();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setMyStream(null);
    if (codeRef.current) await fbRemove(`nobar/${codeRef.current}/peers/${uid.current}`);
    setMode("home"); setPeers([]); setRoomCode(""); codeRef.current = "";
  };

  const toggleMute = () => {
    if (!streamRef.current) return;
    const next = !muted;
    streamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };
  const toggleCam = async () => {
    const next = !camOff;
    if (!next) {
      // Turning cam ON — always re-request camera permission
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (streamRef.current && videoTrack) {
          // Replace existing video track or add new one
          const existing = streamRef.current.getVideoTracks();
          existing.forEach(t => { t.stop(); streamRef.current?.removeTrack(t); });
          streamRef.current.addTrack(videoTrack);
          setMyStream(new MediaStream([...streamRef.current.getTracks()]));
          // Update all peer connections with new video track
          pcMap.current.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === "video");
            if (sender) sender.replaceTrack(videoTrack).catch(() => {});
            else pc.addTrack(videoTrack, streamRef.current!);
          });
        }
      } catch {
        // Permission denied — can't turn on cam
        return;
      }
    } else {
      // Turning cam OFF — just disable video tracks
      streamRef.current?.getVideoTracks().forEach(t => { t.enabled = false; });
    }
    setCamOff(next);
  };

  useEffect(() => () => {
    esRef.current?.close();
    pcMap.current.forEach(pc => pc.close());
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  if (mode === "home") return (
    <NobarHome
      joinInput={joinInput} setJoinInput={setJoinInput}
      error={error} loading={loading} initAnime={initAnime}
      onCreate={handleCreate} onJoin={handleJoin}
    />
  );

  return (
    <NobarRoom
      code={roomCode} isHost={isHost}
      myStream={myStream} muted={muted} camOff={camOff}
      peers={peers} roomAnime={roomAnime}
      fullscreenPeer={fullscreenPeer} setFullscreenPeer={setFullscreenPeer}
      onMute={toggleMute} onCam={toggleCam} onLeave={handleLeave}
      onShareAnime={async (a) => {
        if (codeRef.current) { await fbPatch(`nobar/${codeRef.current}`, { anime: a }); setRoomAnime(a); }
      }}
    />
  );
}
