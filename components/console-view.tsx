"use client";

import { EpochBar } from "./epoch-bar";
import { DemoRunner } from "./demo-runner";
import { BuyCadencePanel } from "./buy-cadence-panel";
import { SwapPanel } from "./swap-panel";
import { RejectLogPanel } from "./reject-log-panel";
import { GraphPanel } from "./graph-panel";
import { IntelPanel } from "./intel-panel";

const FACTS = [
  ["Invariant", "Passive reserves cannot unlock via same-block order splitting."],
  ["Slot honesty", "Unused cadence slots expire worthless at epoch refresh."],
  ["Seat ≠ equity", "A slot is capacity, not a share of reserves."],
  ["Depth is capped", "Fills quote active reserves only — never passive."],
];

function FactsCard() {
  return (
    <section
      aria-label="Protocol facts"
      className="flex flex-col justify-between rounded-lg border border-border bg-surface p-5 lg:col-span-2"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {FACTS.map(([title, body]) => (
          <div key={title}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
              {title}
            </p>
            <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted">
        Demo runs on an Anvil fork. Explicitly not TAP / Dockyard / Parity. No
        fake APY. No finalist guarantee.
      </p>
    </section>
  );
}

export function ConsoleView() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          demo console
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          One pair. One λ. Every epoch, a fresh set of slots.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          Buy a slot, fill against active depth, and watch the hook refuse
          everyone without one. State is shared across the Console, Graph, and
          Intel pages — the ticker in the header follows you.
        </p>

        <div className="mt-8 space-y-6">
          <EpochBar />
          <DemoRunner />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <BuyCadencePanel className="lg:col-span-1" />
          <SwapPanel className="lg:col-span-2" />
          <RejectLogPanel className="lg:col-span-1" />
          <GraphPanel className="lg:col-span-2" />
          <IntelPanel className="lg:col-span-1" />
          <FactsCard />
        </div>
      </div>
    </main>
  );
}
