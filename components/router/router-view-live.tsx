"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { ArrowRight, Globe, Zap } from "lucide-react";
import { Panel } from "@/components/panel";
import { EthIcon } from "@/components/eth-icon";
import { useCadence } from "@/lib/cadence/provider";
import { useModuleProbe } from "@/lib/cadence/use-module-probe";
import { loadDeployment, routerRegistryAbi } from "@/lib/cadence/abis";
import { publicClientFor, walletClientFor } from "@/lib/cadence/contract";
import { shortAddress } from "@/lib/wallet/use-injected-wallet";
import { describeRevert, sendWrite } from "@/lib/cadence/write";
import { fmtEth, fmtPricePerEth } from "@/lib/cadence/format";

interface RouteRow {
  poolId: `0x${string}`;
  hook: `0x${string}`;
  remaining: number;
  slotPrice: number;
  quoteOut: number | null;
  canServe: boolean;
}

/**
 * Multi-pool router (Extended §2) — fully wired: live quoteRoute reads on
 * every intent change, per-pool fill quotes from the hook, row selection,
 * and a working one-click executeRoute through the injected wallet.
 */
export function RouterView() {
  const s = useCadence();
  const wired = useModuleProbe(s.chain.chainId, (d) => d.router, routerRegistryAbi, "poolCount");

  const [sizeEth, setSizeEth] = useState("0.05");
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const size = Number.isFinite(Number(sizeEth)) && Number(sizeEth) > 0 ? Number(sizeEth) : 0;

  // live quotes on every intent change (debounced) + on new blocks
  useEffect(() => {
    if (wired !== true || s.chain.chainId == null || size === 0) {
      queueMicrotask(() => setRows([]));
      return;
    }
    let alive = true;
    queueMicrotask(() => setLoading(true));
    const timer = setTimeout(() => {
      void (async () => {
        const d = await loadDeployment(s.chain.chainId as number);
        if (!d || !alive) return;
        const pc = publicClientFor(s.chain.chainId as number);
        try {
          const [ids, hooks, remaining, prices] = (await pc.readContract({
            address: d.router,
            abi: routerRegistryAbi,
            functionName: "quoteRoute",
            args: [parseUnits(String(size), 18), true],
          })) as unknown as [`0x${string}`[], `0x${string}`[], bigint[], bigint[]];

          // fill quotes from each hook's active-only curve
          const quotes = await Promise.all(
            hooks.map(async (h, i) => {
              if (remaining[i] < parseUnits(String(size), 18)) return null;
              try {
                const r = (await pc.readContract({
                  address: h,
                  abi: [
                    {
                      type: "function",
                      name: "quoteOutUsdc",
                      stateMutability: "view",
                      inputs: [{ name: "sizeEth", type: "uint256" }],
                      outputs: [{ name: "", type: "uint256" }],
                    },
                  ],
                  functionName: "quoteOutUsdc",
                  args: [parseUnits(String(size), 18)],
                })) as bigint;
                return Number(formatUnits(r, 18));
              } catch {
                return null;
              }
            }),
          );

          if (!alive) return;
          setRows(
            ids.map((pid, i) => ({
              poolId: pid,
              hook: hooks[i],
              remaining: Number(formatUnits(remaining[i], 18)),
              slotPrice: Number(formatUnits(prices[i], 18)),
              quoteOut: quotes[i],
              canServe: quotes[i] !== null,
            })),
          );
          setError(null);
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message.slice(0, 140) : "quote failed");
        } finally {
          if (alive) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [wired, s.chain.chainId, s.chain.blockNumber, size]);

  async function execute() {
    if (!selected || !s.wallet.address || !s.chain.chainId || pending) return;
    setPending(true);
    setError(null);
    setNote(null);
    try {
      const d = await loadDeployment(s.chain.chainId);
      if (!d) return;
      const pc = publicClientFor(s.chain.chainId);
      const provider = (window as unknown as { ethereum: unknown }).ethereum;
      const wc = walletClientFor(provider, s.chain.chainId);
      if (!wc) return;

      const sizeWei = parseUnits(String(size), 18);
      const row = rows.find((r) => r.poolId === selected);
      const slotCostWei = row ? parseUnits(fmtEth(row.slotPrice * size, 6), 18) : 0n;

      const res = await sendWrite(wc, pc, () =>
        wc.writeContract({
          address: d.router,
          abi: routerRegistryAbi,
          functionName: "executeRoute",
          args: [selected as `0x${string}`, sizeWei],
          account: s.wallet.address as `0x${string}`,
          chain: null,
          // overpay size + slot cost; the router refunds everything unused
          value: sizeWei + (slotCostWei ?? 0n),
        }),
      );
      if (!res.ok) {
        setError(describeRevert(res.selector) ?? res.message);
        return;
      }
      setNote("Route executed — slot minted if needed, fill done. Position updates next block.");
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 140) : "execute failed");
    } finally {
      setPending(false);
    }
  }

  const canExecute = selected !== null && rows.some((r) => r.poolId === selected && r.canServe) && !!s.wallet.address && !pending;

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          multi-pool router
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          One intent. Every cadence pool competes for it.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          The router quotes registered pools on remaining capacity and slot
          price, then routes your fill — and shows you the pool every time.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <IntentPanel className="lg:col-span-1" sizeEth={sizeEth} setSizeEth={setSizeEth} wired={wired} />
          <QuoteTablePanel
            className="lg:col-span-2"
            rows={rows}
            loading={loading}
            selected={selected}
            onSelect={setSelected}
            wired={wired}
            error={error}
          />
          <RouterFactsPanel className="lg:col-span-1" />
          <ExecutePanel
            className="lg:col-span-2"
            canExecute={canExecute}
            onExecute={() => void execute()}
            pending={pending}
            selected={selected}
            sizeEth={size}
            rows={rows}
            note={note}
            error={error}
          />
        </div>
      </div>
    </main>
  );
}

function Unwired({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-2 py-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="max-w-sm text-sm leading-6 text-muted">
        The registry is live on two networks. Switch (or add) the chain in your
        wallet with one click — the router lights up right after.
      </p>
    </div>
  );
}

function IntentPanel({
  className = "",
  sizeEth,
  setSizeEth,
  wired,
}: {
  className?: string;
  sizeEth: string;
  setSizeEth: (v: string) => void;
  wired: boolean | null;
}) {
  return (
    <Panel
      id="router-intent"
      step="1 · intent"
      title="Your intent"
      caption="Sell ETH against active depth — the router finds capacity for it."
      className={className}
    >
      <div className="flex flex-1 flex-col gap-4">
        <div>
          <label
            htmlFor="router-size"
            className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted"
          >
            size (ETH)
          </label>
          <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-3 focus-within:border-accent">
            <input
              id="router-size"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              autoComplete="off"
              value={sizeEth}
              onChange={(e) => setSizeEth(e.target.value)}
              className="h-11 w-full bg-transparent font-mono tabular-nums text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <EthIcon className="inline size-3 shrink-0 text-muted" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {["0.01", "0.05", "0.1"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setSizeEth(v)}
                className="h-8 rounded-md border border-border px-2.5 font-mono text-xs tabular-nums text-muted transition-colors duration-100 hover:border-accent hover:text-accent-strong"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {wired === true ? (
          <p className="text-xs leading-5 text-muted">
            Quotes refresh automatically as blocks land. Pick a pool in the
            comparison table, then execute — one transaction.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function QuoteTablePanel({
  className = "",
  rows,
  loading,
  selected,
  onSelect,
  wired,
  error,
}: {
  className?: string;
  rows: RouteRow[];
  loading: boolean;
  selected: string | null;
  onSelect: (pid: string) => void;
  wired: boolean | null;
  error: string | null;
}) {
  return (
    <Panel
      id="router-quotes"
      step="2 · quotes"
      title="Route comparison"
      caption="Every registered pool with its remaining capacity and slot cost. Select a row to execute."
      className={className}
    >
      {wired === true ? (
        <div className="flex-1 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left font-mono text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-widest text-muted">
                <th scope="col" className="py-2 pr-3 font-normal">pool</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">remaining</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">slot cost</th>
                <th scope="col" className="py-2 text-right font-normal">fill out (USDC)</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs uppercase tracking-widest text-muted">
                    quoting pools…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs uppercase tracking-widest text-muted">
                    {error ?? "no pools can serve this intent yet"}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.poolId}
                    onClick={() => r.canServe && onSelect(r.poolId)}
                    className={`cursor-pointer border-t border-border transition-colors duration-100 ${
                      selected === r.poolId ? "bg-accent/10" : r.canServe ? "hover:bg-surface-raised" : "opacity-40"
                    }`}
                    aria-selected={selected === r.poolId}
                  >
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-1.5 text-accent-strong">
                        <Globe className="size-3.5" aria-hidden />
                        {shortAddress(r.poolId)}
                      </span>
                    </td>
                    <td className="py-3 pr-3 tabular-nums">
                      {fmtEth(r.remaining, 3)} <EthIcon className="inline size-3" />
                    </td>
                    <td className="py-3 pr-3 tabular-nums">
                      {fmtPricePerEth(r.slotPrice)} ETH
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {r.quoteOut != null ? `${fmtEth(r.quoteOut, 2)}` : r.canServe ? "—" : "insufficient capacity"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {loading && rows.length > 0 ? (
            <p className="pt-2 text-[10px] uppercase tracking-widest text-muted">refreshing…</p>
          ) : null}
        </div>
      ) : (
        <Unwired label={wired === false ? "Router registry not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function ExecutePanel({
  className = "",
  canExecute,
  onExecute,
  pending,
  selected,
  sizeEth,
  rows,
  note,
  error,
}: {
  className?: string;
  canExecute: boolean;
  onExecute: () => void;
  pending: boolean;
  selected: string | null;
  sizeEth: number;
  rows: RouteRow[];
  note: string | null;
  error: string | null;
}) {
  const row = rows.find((r) => r.poolId === selected);
  return (
    <Panel
      id="router-execute"
      step="3 · execute"
      title="Execute a route"
      caption="Mints/buys the slot if needed, then routes the swap — one transaction."
      className={className}
    >
      <div className="flex flex-1 flex-col items-start justify-center gap-3 py-2">
        <div className="grid w-full gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">pool</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-foreground">
              {row ? shortAddress(row.poolId) : "— pick a row"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">size</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-foreground">
              {sizeEth} <EthIcon className="inline size-3" /> ETH
            </p>
          </div>
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">fill out</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-accent-strong">
              {row?.quoteOut != null ? `${fmtEth(row.quoteOut, 2)} USDC` : "—"}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={!canExecute}
          onClick={onExecute}
          className="inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Zap className="size-4" aria-hidden />
          {pending ? "executing…" : "execute route"}
        </button>
        {note ? (
          <p role="status" className="rounded-md border border-success/50 bg-success/5 px-3 py-2 text-xs leading-5 text-success">
            {note}
          </p>
        ) : null}
        {error ? (
          <p role="status" className="rounded-md border border-danger/50 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger">
            {error}
          </p>
        ) : null}
        {!note && !error ? (
          <p className="text-xs leading-5 text-muted">
            Unused ETH refunds in the same transaction. The poolId is shown to you — never silent.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

function RouterFactsPanel({ className = "" }: { className?: string }) {
  const FACTS = [
    ["Registered pools only", "Deployers register pools; the router quotes those."],
    ["Capacity-aware", "Routes weigh remaining capacity, not just price."],
    ["Never silent", "The executed poolId is always shown to you."],
    ["Slots if needed", "The route mints/buys a cadence slot before the fill."],
  ] as const;
  return (
    <Panel id="router-facts" title="Routing rules" className={className}>
      <div className="grid flex-1 gap-5 sm:grid-cols-2">
        {FACTS.map(([t, b]) => (
          <div key={t}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{t}</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">{b}</p>
          </div>
        ))}
        <a
          href="/console"
          className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-accent-strong transition-colors duration-100 hover:text-foreground"
        >
          or route manually in the console <ArrowRight className="size-3.5" aria-hidden />
        </a>
      </div>
    </Panel>
  );
}
