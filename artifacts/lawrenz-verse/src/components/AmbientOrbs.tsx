export default function AmbientOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Large pink orb top-left */}
      <div style={{
        position: "absolute", top: "-15%", left: "-10%",
        width: 480, height: 480, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(244,114,182,0.12) 0%, transparent 70%)",
        animation: "orb-drift 22s ease-in-out infinite",
        filter: "blur(40px)",
      }} />
      {/* Large blue orb top-right */}
      <div style={{
        position: "absolute", top: "-10%", right: "-12%",
        width: 520, height: 520, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(96,165,250,0.10) 0%, transparent 70%)",
        animation: "orb-drift 28s ease-in-out 4s infinite reverse",
        filter: "blur(50px)",
      }} />
      {/* Mid lavender orb center */}
      <div style={{
        position: "absolute", top: "35%", left: "30%",
        width: 360, height: 360, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(167,139,250,0.07) 0%, transparent 70%)",
        animation: "orb-drift 35s ease-in-out 8s infinite",
        filter: "blur(60px)",
      }} />
      {/* Small rose orb bottom-left */}
      <div style={{
        position: "absolute", bottom: "10%", left: "5%",
        width: 280, height: 280, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(251,113,133,0.09) 0%, transparent 70%)",
        animation: "orb-drift 18s ease-in-out 2s infinite reverse",
        filter: "blur(35px)",
      }} />
      {/* Small sky orb bottom-right */}
      <div style={{
        position: "absolute", bottom: "5%", right: "8%",
        width: 320, height: 320, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(125,211,252,0.07) 0%, transparent 70%)",
        animation: "orb-drift 24s ease-in-out 12s infinite",
        filter: "blur(45px)",
      }} />
    </div>
  );
}
