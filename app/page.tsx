import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/hero";
import { EpochBar } from "@/components/epoch-bar";
import { BuyApronPanel } from "@/components/buy-apron-panel";
import { SwapPanel } from "@/components/swap-panel";
import { RejectLogPanel } from "@/components/reject-log-panel";
import { GraphPanel } from "@/components/graph-panel";
import { IntelPanel } from "@/components/intel-panel";
import { ApronProvider } from "@/lib/apron/provider";

const FACTS = [
  ["Invariant", "Passive reserves cannot unlock via same-block order splitting."],
  ["Slot honesty", "Unused apron slots expire worthless at epoch refresh."],
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

export default function Home() {
  return (
    <ApronProvider>
      <SiteHeader />
      <main className="flex-1">
        <Hero />

        <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 lg:px-8">
          <div id="console" className="scroll-mt-20">
            <EpochBar />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <BuyApronPanel />
            <SwapPanel />
            <RejectLogPanel />
            <GraphPanel />
            <IntelPanel />
            <FactsCard />
          </div>
        </div>
      </main>
      <SiteFooter />
    </ApronProvider>
  );
}
