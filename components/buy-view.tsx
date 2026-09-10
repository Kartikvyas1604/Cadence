"use client";

import { BuyCadencePanel } from "./buy-cadence-panel";
import { RejectLogPanel } from "./reject-log-panel";

/** /buy — public primary mint (demo lead). Capacity comes from the LP budget. */
export function BuyView() {
  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          primary market
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          Buy a cadence slot for this epoch.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          Fixed price. Current epoch only. Unused slots expire worthless — named
          risk, not fine print.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <BuyCadencePanel className="lg:col-span-2" />
          <RejectLogPanel className="lg:col-span-1" />
        </div>
      </div>
    </div>
  );
}
