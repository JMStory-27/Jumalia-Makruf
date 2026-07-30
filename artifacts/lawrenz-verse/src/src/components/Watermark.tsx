export default function Watermark() {
  return (
    <div className="fixed bottom-[72px] right-3 z-40 pointer-events-none select-none animate-wm">
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
        style={{
          background: "rgba(91,33,182,0.08)",
          border: "1px solid rgba(124,58,237,0.18)",
          backdropFilter: "blur(10px)",
        }}>
        <span style={{ fontSize: 12 }}>⚡</span>
        <span style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.14em",
          background: "linear-gradient(90deg, #BF5FFF, #FF4DB2)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          KING LAWRENZ
        </span>
      </div>
    </div>
  );
}
