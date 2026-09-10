"use client";

import {
  LpDepositPanel,
  LpPositionCard,
  LpCapacityPanel,
  LpRevenuePanel,
  LpWithdrawPanel,
  LpSalesFeed,
} from "./lp/lp-panels";

const FACTS = [
  ["You sell capacity", "Your active depth becomes ERC-1155 cadence slots at a fixed price."],
  ["Revenue ≠ fees", "Slot sales pay you directly. Swap fees are a separate ledger."],
  ["Withdraw is bounded", "You cannot orphan capacity already sold this epoch — the hook reverts."],
  ["Slot ≠ equity", "Buyers hold expiring capacity tickets. Your shares are the equity."],
];

export function LpView() {
  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          LP desk
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          Deposit once. Sell capacity every epoch.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          Deposit liquidity, watch the λ split become this epoch&apos;s capacity
          budget, and earn on every cadence slot sold against your depth —
          while the gate keeps arbitrageurs from draining you for free.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <LpDepositPanel className="lg:col-span-1" />
          <LpPositionCard className="lg:col-span-2" />
          <LpCapacityPanel className="lg:col-span-1" />
          <LpRevenuePanel className="lg:col-span-1" />
          <LpSalesFeed className="lg:col-span-1" />
          <LpWithdrawPanel className="lg:col-span-3" />
        </div>

        <section
          aria-label="LP facts"
          className="mt-6 rounded-lg border border-border bg-surface p-5"
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FACTS.map(([title, body]) => (
              <div key={title}>
                <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
                  {title}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
