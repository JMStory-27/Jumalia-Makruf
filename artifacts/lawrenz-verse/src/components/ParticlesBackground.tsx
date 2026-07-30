import { useMemo } from "react";

const COLORS = [
  "#F472B6","#EC4899","#A78BFA","#60A5FA","#FB7185",
  "#FBCFE8","#818CF8","#7DD3FC","#F9A8D4","#93C5FD",
];

export default function ParticlesBackground() {
  const particles = useMemo(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: `${(i * 4.3 + 1.5) % 100}%`,
      size: 1 + (i % 2),
      color: COLORS[i % COLORS.length],
      duration: `${10 + (i % 12)}s`,
      delay: `${(i * 0.72) % 10}s`,
    })), []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute",
          bottom: "-8px",
          left: p.left,
          width: p.size,
          height: p.size,
          borderRadius: "50%",
          background: p.color,
          boxShadow: `0 0 ${p.size * 5}px ${p.color}`,
          animation: `particle-float ${p.duration} linear ${p.delay} infinite`,
          opacity: 0.65,
        }} />
      ))}
    </div>
  );
}
