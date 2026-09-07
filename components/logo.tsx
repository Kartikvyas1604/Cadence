export function CadenceMark({
  size = 32,
  gradientId = "cadence-g",
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
      aria-label="Cadence logo"
    >
      <defs>
        <linearGradient id={gradientId} x1="32" y1="13" x2="32" y2="51" gradientUnits="userSpaceOnUse">
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
      {/* rhythm bars — the epoch peak in the middle, ticking off toward the edges */}
      <rect x="10.5" y="24" width="5" height="16" rx="2.5" fill={`url(#${gradientId})`} opacity="0.5" />
      <rect x="20" y="18" width="5" height="28" rx="2.5" fill={`url(#${gradientId})`} />
      <rect x="29.5" y="13" width="5" height="38" rx="2.5" fill={`url(#${gradientId})`} />
      <rect x="39" y="20" width="5" height="24" rx="2.5" fill={`url(#${gradientId})`} />
      <rect x="48.5" y="26" width="5" height="12" rx="2.5" fill={`url(#${gradientId})`} opacity="0.5" />
    </svg>
  );
}

export function CadenceLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <CadenceMark size={compact ? 26 : 30} />
      <span
        className={`font-serif leading-none tracking-tight text-foreground ${
          compact ? "text-xl" : "text-2xl"
        }`}
      >
        Cadence
      </span>
    </span>
  );
}
