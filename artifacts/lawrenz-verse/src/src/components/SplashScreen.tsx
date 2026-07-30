import { useEffect, useState } from "react";

export default function SplashScreen() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500);
    const t2 = setTimeout(() => setPhase(2), 1400);
    const t3 = setTimeout(() => setPhase(3), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center z-[9999] overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 40%, #12002e 0%, #04040a 65%)" }}>

      {/* Animated rings */}
      {[180, 300, 440].map((size, i) => (
        <div key={i} className="absolute rounded-full"
          style={{
            width: size, height: size,
            border: "1px solid",
            borderColor: ["rgba(191,95,255,0.25)", "rgba(255,77,178,0.15)", "rgba(0,212,255,0.1)"][i],
            animation: `splash-ring ${2 + i * 0.5}s ease-out ${i * 0.2}s infinite`,
          }} />
      ))}

      {/* Spinning accent ring */}
      <div className="absolute w-32 h-32 rounded-full"
        style={{
          border: "2px dashed rgba(191,95,255,0.2)",
          animation: "ring-spin 8s linear infinite",
        }} />

      {/* Center logo */}
      <div style={{ animation: "splash-logo 0.9s cubic-bezier(.175,.885,.32,1.275) 0.2s both" }}
        className="relative flex flex-col items-center gap-5 z-10">

        {/* Icon */}
        <div className="relative w-28 h-28 rounded-3xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #5B21B6 0%, #7C3AED 40%, #DB2777 100%)",
            boxShadow: "0 0 50px rgba(124,58,237,0.7), 0 0 100px rgba(219,39,119,0.3)",
          }}>
          <span style={{ fontSize: 56, lineHeight: 1 }}>⚡</span>
          {/* Corner accent */}
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full"
            style={{ background: "#00D4FF", boxShadow: "0 0 10px #00D4FF" }} />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full"
            style={{ background: "#FF3535", boxShadow: "0 0 8px #FF3535" }} />
        </div>

        {/* Name */}
        <div className="text-center">
          <h1 style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: "clamp(26px, 7vw, 44px)",
            fontWeight: 900,
            background: "linear-gradient(135deg, #BF5FFF 0%, #FF4DB2 50%, #00D4FF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "0.04em",
            lineHeight: 1.1,
          }}>
            LawrenzVerse
          </h1>
          <p style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.25em",
            color: "rgba(255,255,255,0.3)",
            marginTop: 6,
            textTransform: "uppercase",
          }}>
            by King Lawrenz
          </p>
        </div>

        {/* Categories */}
        {phase >= 1 && (
          <div className="flex gap-3 animate-slide-up">
            {[["🐉", "#FF3535"], ["🇰🇷", "#FF4DB2"], ["🎬", "#00D4FF"], ["📺", "#00FF9F"]].map(([e, c], i) => (
              <div key={i} className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `${c as string}15`, border: `1px solid ${c as string}33`, boxShadow: `0 0 8px ${c as string}22` }}>
                <span style={{ fontSize: 20 }}>{e as string}</span>
              </div>
            ))}
          </div>
        )}

        {/* Loading dots */}
        {phase >= 2 && (
          <div className="flex gap-2 mt-1 animate-slide-up">
            {["#FF3535", "#FF4DB2", "#00D4FF"].map((c, i) => (
              <div key={i} className="w-2 h-2 rounded-full"
                style={{
                  background: c,
                  boxShadow: `0 0 6px ${c}`,
                  animation: `float-up 0.8s ease-in-out ${i * 0.18}s infinite`,
                }} />
            ))}
          </div>
        )}
      </div>

      {/* Version tag */}
      <p className="absolute bottom-8 text-center"
        style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.15)", letterSpacing: "0.1em" }}>
        v2.0 · Dracin · Drakor · Film · Series
      </p>
    </div>
  );
}
