export function EthIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 20"
      fill="currentColor"
      aria-hidden
      className={`inline-block h-[0.72em] w-auto -translate-y-[0.02em] ${className}`}
    >
      <path d="M6 0 0 10.1 6 13.9 12 10.1Z" />
      <path d="M6 20 0 11.9 6 15.3 12 11.9Z" />
    </svg>
  );
}
