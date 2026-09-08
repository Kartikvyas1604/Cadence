"use client";

import { SwapPanel } from "./swap-panel";
import { RejectLogPanel } from "./reject-log-panel";

/** /swap — the gate: slot ≥ size, notional burned, active-only fill. */
export function SwapView() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          fill
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          Swap against active depth.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          beforeSwap checks slot ≥ size, burns the notional, fills against
          active reserves only. No slot, no fill.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <SwapPanel className="lg:col-span-2" />
          <RejectLogPanel className="lg:col-span-1" />
        </div>
      </div>
    </main>
  );
}
