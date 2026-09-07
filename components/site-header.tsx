import Link from "next/link";
import { ApronLogo } from "./logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
        <Link
          href="/"
          className="rounded-sm"
          aria-label="Apron home"
        >
          <ApronLogo />
        </Link>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted md:inline-flex">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            anvil fork · live
          </span>
          <span className="inline-flex items-center rounded-full border border-border px-3 py-1.5 font-mono text-xs text-muted">
            ETHOnline 2026
          </span>
        </div>
      </div>
    </header>
  );
}
