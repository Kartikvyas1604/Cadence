export function ApronMark({
  size = 32,
  gradientId = "apron-g",
}: {
  size?: number;
  gradientId?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Apron logo"
    >
      <defs>
        <linearGradient id={gradientId} x1="32" y1="6" x2="32" y2="54" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFCB57" />
          <stop offset="1" stopColor="#E89B2C" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="14" fill="#14120D" />
      <rect
        x="1.75"
        y="1.75"
        width="60.5"
        height="60.5"
        rx="13.25"
        stroke="#3A3324"
        strokeWidth="1.5"
      />
      <path
        d="M26 12 Q32 4 38 12 L38 30 L46 34 L46 48 Q46 53 41 53 L23 53 Q18 53 18 48 L18 34 L26 30 Z"
        fill={`url(#${gradientId})`}
      />
      {/* the slot — negative space across the bib */}
      <rect x="28.5" y="18" width="7" height="3" rx="1.5" fill="#14120D" />
      {/* stitched pocket */}
      <path
        d="M22 41 H42"
        stroke="#B97F1F"
        strokeWidth="1.5"
        strokeDasharray="3 2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ApronLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <ApronMark size={compact ? 26 : 30} />
      <span
        className={`font-serif leading-none tracking-tight text-foreground ${
          compact ? "text-xl" : "text-2xl"
        }`}
      >
        Apron
      </span>
    </span>
  );
}
