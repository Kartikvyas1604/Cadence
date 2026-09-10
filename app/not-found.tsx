import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Not found — Cadence" };

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-24">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">404</p>
        <h1 className="mt-3 font-serif text-4xl text-foreground md:text-5xl">Page not found</h1>
        <p className="mt-3 text-sm text-muted">This route doesn&apos;t exist.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="h-11 inline-flex items-center rounded-md border border-border-strong px-5 text-sm text-foreground hover:bg-surface-raised">Home</Link>
          <Link href="/buy" className="h-11 inline-flex items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground hover:bg-accent-strong">Buy a slot</Link>
          <Link href="/console" className="h-11 inline-flex items-center rounded-md border border-border-strong px-5 text-sm text-foreground hover:bg-surface-raised">Console</Link>
        </div>
      </div>
    </div>
  );
}
