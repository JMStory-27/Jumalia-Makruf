/** ⚡ LightningBolt — SVG petir canggih dengan gradient elektrik + glow.
 *  Gantikan emoji ⚡ di seluruh app dengan komponen ini untuk tampilan yang lebih
 *  premium dan konsisten dengan identitas visual Lawnime. */
interface LightningBoltProps {
  /** Ukuran (width = height). Default: 16 */
  size?: number;
  /** Kalau true, petir animasi pulse/kilat terus-menerus */
  animated?: boolean;
  /** Variant warna: "electric" (biru-ungu default) | "fire" (oranye-merah) | "ice" (cyan-putih) | "gold" */
  variant?: "electric" | "fire" | "ice" | "gold";
  className?: string;
  style?: React.CSSProperties;
}

const GRADIENTS: Record<NonNullable<LightningBoltProps["variant"]>, [string, string, string]> = {
  electric: ["#22D3EE", "#A78BFA", "#F472B6"],
  fire:     ["#FBBF24", "#FB923C", "#EF4444"],
  ice:      ["#E0F2FE", "#BAE6FD", "#7DD3FC"],
  gold:     ["#FDE68A", "#FBBF24", "#F59E0B"],
};

export default function LightningBolt({
  size = 16,
  animated = false,
  variant = "electric",
  className,
  style,
}: LightningBoltProps) {
  const [c1, c2, c3] = GRADIENTS[variant];
  const uid = variant + size; // stable enough for same-page dedup

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden
    >
      <defs>
        {/* Gradient utama petir */}
        <linearGradient id={`lg-${uid}`} x1="14" y1="1" x2="8" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={c1} />
          <stop offset="48%"  stopColor={c2} />
          <stop offset="100%" stopColor={c3} />
        </linearGradient>

        {/* Gradient inti (bright core) — jauh lebih terang di tengah */}
        <linearGradient id={`core-${uid}`} x1="13" y1="3" x2="10" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="100%" stopColor={c1}      stopOpacity="0.3" />
        </linearGradient>

        {/* Glow filter — efek cahaya elektrik */}
        <filter id={`glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="blur2" />
          <feMerge>
            <feMergeNode in="blur1" />
            <feMergeNode in="blur2" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Shimmer mask untuk animasi */}
        {animated && (
          <linearGradient id={`shimmer-${uid}`} gradientTransform="rotate(70)">
            <stop offset="0%"   stopColor="white" stopOpacity="0" />
            <stop offset="45%"  stopColor="white" stopOpacity="0.55" />
            <stop offset="55%"  stopColor="white" stopOpacity="0.55" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values="-1 0; 2 0; -1 0"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </linearGradient>
        )}
      </defs>

      {/* ── Layer 1: glow halo (diffuse, sangat transparan) ── */}
      <path
        d="M14.5 1.5 L5.5 13.5 H11.2 L9.5 22.5 L18.5 10.5 H12.8 Z"
        fill={c2}
        opacity={0.22}
        filter={`url(#glow-${uid})`}
        transform="scale(1.08) translate(-0.9,-0.9)"
      />

      {/* ── Layer 2: body petir utama dengan gradient ── */}
      <path
        d="M13.8 2 L5 13.5 H11.2 L10.2 22 L19 10.5 H12.8 Z"
        fill={`url(#lg-${uid})`}
        filter={`url(#glow-${uid})`}
      />

      {/* ── Layer 3: inti terang (bright core) — garis tipis di tengah petir ── */}
      <path
        d="M13 4.5 L7.8 12.8 H11.6 L10.8 19.5 L16.2 11.2 H12.4 Z"
        fill={`url(#core-${uid})`}
        opacity={0.55}
      />

      {/* ── Layer 4: percikan di ujung atas ── */}
      <circle cx="14.2" cy="2.6" r="0.8" fill={c1} opacity={0.9}>
        {animated && (
          <animate attributeName="opacity" values="0.9;0.3;0.9" dur="0.8s" repeatCount="indefinite" />
        )}
      </circle>
      {/* percikan ujung bawah */}
      <circle cx="9.8" cy="21.4" r="0.7" fill={c3} opacity={0.85}>
        {animated && (
          <animate attributeName="opacity" values="0.85;0.2;0.85" dur="0.8s" begin="0.4s" repeatCount="indefinite" />
        )}
      </circle>

      {/* ── Layer 5: shimmer overlay (animated only) ── */}
      {animated && (
        <path
          d="M13.8 2 L5 13.5 H11.2 L10.2 22 L19 10.5 H12.8 Z"
          fill={`url(#shimmer-${uid})`}
          opacity={0.4}
        />
      )}
    </svg>
  );
}
