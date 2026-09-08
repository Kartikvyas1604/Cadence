"use client";

import { useState } from "react";
import { Panel } from "@/components/panel";
import { EthIcon } from "@/components/eth-icon";
import { useCadence, useCadenceActions } from "@/lib/cadence/provider";
import { fmtEth } from "@/lib/cadence/format";

/**
 * LP deposit — ETH into the venue. Shares are equity in the pool;
 * the λ-partitioned active side becomes the epoch's capacity budget.
 */
export function LpDepositPanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const { depositLpEth } = useCadenceActions();
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState(false);

  const wired = s.lp.available === true;
  const num = Number(amount);
  const canDeposit = wired && !!s.wallet.address && num > 0 && !pending;

  return (
    <Panel
      id="lp-deposit"
      step="1 · deposit"
      title="Deposit liquidity"
      caption="Your deposit joins the pool. The λ split of it becomes this epoch's cadence-slot capacity."
      className={className}
    >
      {!wired ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-2 py-6">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            {s.lp.available === false ? "LP module not deployed yet" : "checking chain…"}
          </p>
          <p className="max-w-sm text-sm leading-6 text-muted">
            The deposit, revenue, and withdraw fields go live the moment the LP
            accounting lands on the deployed hook. Pool capacity below is live
            already.
          </p>
        </div>
      ) : !s.wallet.address ? (
        <p className="flex flex-1 items-center justify-center py-6 text-sm text-muted">
          Connect a wallet to deposit.
        </p>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div>
            <label
              htmlFor="lp-deposit-amount"
              className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted"
            >
              amount (ETH)
            </label>
            <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-3 focus-within:border-accent">
              <input
                id="lp-deposit-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 w-full bg-transparent font-mono tabular-nums text-foreground outline-none"
              />
              <span className="shrink-0 font-mono text-xs text-muted">
                <EthIcon className="inline size-3 align-[-1px]" /> ETH
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={!canDeposit}
            onClick={async () => {
              setPending(true);
              try {
                await depositLpEth(num);
              } finally {
                setPending(false);
              }
            }}
            className="inline-flex h-11 min-w-24 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "depositing…" : "deposit"}
          </button>

          <p className="text-xs leading-5 text-muted">
            You receive pool shares — not cadence slots. Slots are expiring
            capacity tickets sold against the active budget.
          </p>
        </div>
      )}
    </Panel>
  );
}

/** Position + active/passive allocation. Reserves are live chain reads. */
export function LpPositionCard({ className = "" }: { className?: string }) {
  const s = useCadence();
  const pool = s.pool;
  const pos = s.lp.position;

  const activeShare =
    pool && pool.activeReserveEth + pool.passiveReserveEth > 0
      ? pool.activeReserveEth / (pool.activeReserveEth + pool.passiveReserveEth)
      : null;
  const lambda = pool ? pool.lambdaBps / 10_000 : null;

  return (
    <Panel
      id="lp-position"
      step="2 · position"
      title="Your position"
      caption="Equity in the pool. The λ split below is the epoch's capacity budget."
      className={className}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        {[
          [
            "deposited",
            pos?.depositedEth != null ? (
              <>
                {fmtEth(pos.depositedEth)} <EthIcon />{" "}
                <span className="text-xs text-muted">ETH</span>
              </>
            ) : (
              "—"
            ),
          ],
          ["shares", pos?.shares != null ? fmtEth(pos.shares, 4) : "—"],
        ].map(([k, v]) => (
          <div key={String(k)}>
            <dt className="font-mono text-[11px] uppercase tracking-widest text-muted">{k}</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-accent-strong">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
            active / passive split
          </p>
          <p className="font-mono text-xs text-muted">
            λ = {lambda != null ? `${(lambda * 100).toFixed(0)}%` : "—"}
          </p>
        </div>
        <div
          className="mt-2 h-3 w-full overflow-hidden rounded-full border border-border bg-surface-raised"
          role="img"
          aria-label={
            activeShare != null
              ? `Active reserves ${Math.round(activeShare * 100)} percent, passive ${100 - Math.round(activeShare * 100)} percent`
              : "Reserve split unavailable"
          }
        >
          <div
            className="h-full bg-accent transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${(activeShare ?? 0) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-xs tabular-nums text-muted">
          <span className="flex items-center gap-1 text-accent-strong">
            active {pool ? fmtEth(pool.activeReserveEth) : "—"} <EthIcon /> ETH
          </span>
          <span className="flex items-center gap-1">
            passive {pool ? fmtEth(pool.passiveReserveEth) : "—"} <EthIcon /> ETH
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          Passive is locked until refresh. Only the active side can be filled —
          that is the depth cadence slots sell.
        </p>
      </div>
    </Panel>
  );
}

/** This epoch's capacity budget: budget, sold, remaining, expiry. */
export function LpCapacityPanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const budget = s.pool ? null : null; // budget arrives with the LP module
  const sold = s.lp.soldCapacityEth;
  const remaining = null; // remainingCapacity read lands with the LP module

  return (
    <Panel
      id="lp-capacity"
      step="3 · capacity"
      title="Epoch capacity budget"
      caption="Active liquidity becomes sellable capacity — fixed price, expires at refresh."
      className={className}
    >
      <dl className="grid grid-cols-3 gap-x-4 gap-y-4">
        {(
          [
            ["budget", budget],
            ["sold", sold],
            ["remaining", remaining],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt className="font-mono text-[11px] uppercase tracking-widest text-muted">{k}</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums text-accent-strong">
              {v != null ? (
                <>
                  {fmtEth(v)} <EthIcon />{" "}
                  <span className="text-xs text-muted">ETH</span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted">
        At epoch end, unconsumed capacity expires worthless — the LP keeps the
        sale proceeds and re-partitions at λ.
      </p>
    </Panel>
  );
}

/** Slot revenue (ETH) vs swap fees (USDC) — never conflated. */
export function LpRevenuePanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const pos = s.lp.position;
  const share = s.lp.slotRevenueShareBps;

  return (
    <Panel
      id="lp-revenue"
      step="4 · revenue"
      title="Two ledgers, never mixed"
      caption="Slot-sale revenue accrues pro-rata by shares. Swap fees are a separate ledger."
      className={className}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-surface-raised p-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
            slot revenue
          </p>
          <p className="mt-1 font-mono text-2xl tabular-nums text-accent-strong">
            {pos?.claimableRevenueEth != null ? fmtEth(pos.claimableRevenueEth) : "—"}{" "}
            <span className="inline-flex items-center gap-1 text-sm text-muted">
              <EthIcon /> ETH
            </span>
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            From cadence-slot sales. Share to LPs:{" "}
            <span className="font-mono tabular-nums">
              {share != null ? `${share / 100}%` : "—"}
            </span>
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface-raised p-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-info">
            swap fees
          </p>
          <p className="mt-1 font-mono text-2xl tabular-nums text-info">
            {pos?.claimableSwapFeesUsdc != null ? fmtEth(pos.claimableSwapFeesUsdc) : "—"}{" "}
            <span className="text-sm text-muted">USDC</span>
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            From fills against active depth. Fee:{" "}
            <span className="font-mono tabular-nums">
              {s.lp.swapFeeBps != null ? `${s.lp.swapFeeBps / 100}%` : "—"}
            </span>
          </p>
        </div>
      </div>
      {s.lp.available === false ? (
        <p className="mt-4 text-xs leading-5 text-muted">
          Both ledgers read from the LP module — waiting for deployment.
        </p>
      ) : null}
    </Panel>
  );
}

/** Withdraw within safety bounds — plus the unsafe-withdraw reject demo. */
export function LpWithdrawPanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const { withdrawLpEth } = useCadenceActions();
  const [shares, setShares] = useState("0.5");
  const [pending, setPending] = useState(false);

  const wired = s.lp.available === true;
  const num = Number(shares);
  const withdrawable = s.lp.position?.withdrawableEth ?? null;
  const canWithdraw = wired && !!s.wallet.address && num > 0 && !pending;

  return (
    <Panel
      id="lp-withdraw"
      step="5 · withdraw"
      title="Withdraw"
      caption="You cannot pull liquidity that would orphan capacity already sold this epoch."
      className={className}
    >
      {wired && s.wallet.address ? (
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="lp-withdraw-shares"
              className="font-mono text-xs uppercase tracking-widest text-muted"
            >
              shares to burn
            </label>
            <p className="font-mono text-xs tabular-nums text-muted">
              withdrawable{" "}
              {withdrawable != null ? (
                <span className="inline-flex items-center gap-1">
                  {fmtEth(withdrawable)} <EthIcon /> ETH
                </span>
              ) : (
                "—"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-3 focus-within:border-accent">
            <input
              id="lp-withdraw-shares"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              autoComplete="off"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="h-11 w-full bg-transparent font-mono tabular-nums text-foreground outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!canWithdraw}
              onClick={async () => {
                setPending(true);
                try {
                  await withdrawLpEth(num);
                } finally {
                  setPending(false);
                }
              }}
              className="inline-flex h-11 min-w-28 items-center justify-center rounded-md border border-border-strong bg-surface-raised px-5 text-sm font-medium text-foreground transition-colors duration-100 hover:bg-accent/10 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "withdrawing…" : "withdraw"}
            </button>
            <button
              type="button"
              disabled={!canWithdraw}
              onClick={async () => {
                // demo: attempt more than the safety bound allows — the
                // contract reverts UnsafeWithdraw() into the reject log
                if (withdrawable == null) return;
                setPending(true);
                try {
                  await withdrawLpEth(withdrawable + 500);
                } finally {
                  setPending(false);
                }
              }}
              className="inline-flex h-11 min-w-40 items-center justify-center rounded-md border border-danger/50 px-5 font-mono text-xs uppercase tracking-widest text-danger transition-colors duration-100 hover:bg-danger/10 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
            >
              try unsafe withdraw
            </button>
          </div>
          <p className="text-xs leading-5 text-muted">
            Withdrawable = your pro-rata share of passive + unsold active. The
            unsafe path reverts <span className="font-mono">UNSAFE_WITHDRAW</span>{" "}
            — sold capacity stays backed.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-start justify-center gap-2 py-6">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            {s.lp.available === false ? "LP module not deployed yet" : "connect a wallet"}
          </p>
          <p className="max-w-sm text-sm leading-6 text-muted">
            Withdraw safety runs in the hook: it reverts rather than orphan sold
            capacity. This panel activates with the LP module.
          </p>
        </div>
      )}
    </Panel>
  );
}

/** Recent slot sales — the LP's revenue feed. */
export function LpSalesFeed({ className = "" }: { className?: string }) {
  const s = useCadence();
  const sales = s.graph.filter((e) => e.kind === "mint" || e.kind === "consume").slice(0, 8);

  return (
    <Panel
      id="lp-sales"
      step="live"
      title="Slot sales & consumes"
      caption="Every sale is LP revenue; every consume is capacity spent against your depth."
      className={className}
    >
      {sales.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-2 py-6">
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            no sales this epoch yet
          </p>
          <p className="max-w-sm text-sm leading-6 text-muted">
            Mint a cadence slot in the console — the sale lands here and accrues
            to your revenue ledger.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-px overflow-hidden rounded-md border border-border">
          {sales.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 bg-surface px-4 py-2.5"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                    e.kind === "mint"
                      ? "border-success/50 text-success"
                      : "border-info/50 text-info"
                  }`}
                >
                  {e.kind === "mint" ? "sold" : "consumed"}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {e.kind === "mint" && e.pricePaid != null ? (
                    <span className="inline-flex items-center gap-1">
                      {fmtEth(e.pricePaid, 4)} <EthIcon /> ETH
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {fmtEth(e.size)} <EthIcon /> capacity
                    </span>
                  )}
                </span>
              </span>
              <span className="font-mono text-xs tabular-nums text-muted">
                epoch {e.epochId} · {e.trader.slice(0, 6)}…{e.trader.slice(-4)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
