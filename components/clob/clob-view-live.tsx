"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits, parseEventLogs } from "viem";
import { Check, Zap, X } from "lucide-react";
import { Panel } from "@/components/panel";
import { EthIcon } from "@/components/eth-icon";
import { useCadence } from "@/lib/cadence/provider";
import { useModuleProbe } from "@/lib/cadence/use-module-probe";
import { SwitchChainRow } from "@/components/switch-chain";
import { loadDeployment, clobAbi, slotsAbi } from "@/lib/cadence/abis";
import { publicClientFor, walletClientFor } from "@/lib/cadence/contract";
import { describeRevert, sendWrite } from "@/lib/cadence/write";
import { fmtEth, timeAgo } from "@/lib/cadence/format";
import { shortAddress } from "@/lib/wallet/use-injected-wallet";

/**
 * Secondary Cadence-slot CLOB (Extended §1) — fully wired: live order book
 * from openOrders + orders reads, working placeOrder (buy escrows ETH, sell
 * escrows slots via approval), my orders with cancel, ClobTrade fills from
 * event logs.
 */

interface OrderRow {
  id: number;
  maker: `0x${string}`;
  side: "buy" | "sell";
  epochId: number;
  size: number;
  price: number; // ETH per ETH capacity
  filled: number;
  status: number;
}

const STATUS_LABEL: Record<number, string> = {
  0: "none",
  1: "open",
  2: "filled",
  3: "canceled",
  4: "expired",
};

export function ClobView() {
  const s = useCadence();
  const wired = useModuleProbe(s.chain.chainId, (d) => d.clob ?? d.hook, clobAbiSafe(), "nextOrderId");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (wired !== true || s.chain.chainId == null) return;
    const d = await loadDeployment(s.chain.chainId);
    if (!d?.clob) return;
    const pc = publicClientFor(s.chain.chainId);
    setLoading(true);
    try {
      const epoch = Number((await pc.readContract({ address: d.clob, abi: clobAbiSafe(), functionName: "currentEpoch" })) as bigint);
      const ids = (await pc.readContract({
        address: d.clob as `0x${string}`,
        abi: clobAbiSafe(),
        functionName: "openOrders",
        args: [BigInt(epoch)],
      })) as unknown as bigint[];
      const rows = await Promise.all(
        ids.map(async (id) => {
          const o = (await pc.readContract({
            address: d.clob as `0x${string}`,
            abi: clobAbiSafe(),
            functionName: "orders",
            args: [id],
          })) as [`0x${string}`, boolean, bigint, bigint, bigint, bigint, number];
          return {
            id: Number(id),
            maker: o[0],
            side: o[1] ? "buy" : "sell",
            epochId: Number(o[2]),
            size: Number(formatUnits(o[3], 18)),
            price: Number(formatUnits(o[4], 18)),
            filled: Number(formatUnits(o[5], 18)),
            status: Number(o[6]),
          } as OrderRow;
        }),
      );
      setOrders(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 140) : "order read failed");
    } finally {
      setLoading(false);
    }
  }, [s.chain.chainId, s.chain.blockNumber]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mine = s.wallet.address ? orders.filter((o) => o.maker.toLowerCase() === s.wallet.address?.toLowerCase()) : [];

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          secondary market
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          Trade cadence slots — capacity tickets, not LP shares.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          Post limit orders for the current epoch&apos;s ERC-1155 slots. Orders
          expire at epoch refresh — capacity is time-boxed, so the book resets
          with it.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <OrderBookPanel orders={orders} loading={loading} wired={wired} epochId={s.chain.epochId} />
          <PlaceOrderPanel wired={wired} onDone={() => void refresh()} />
          <MyOrdersPanel mine={mine} wired={wired} pendingId={pendingId} onCancel={async (id) => {
            setPendingId(`c${id}`);
            try {
              const d = await loadDeployment(s.chain.chainId as number);
              if (!d?.clob || !s.chain.chainId) return;
              const pc = publicClientFor(s.chain.chainId);
              const provider = (window as unknown as { ethereum: unknown }).ethereum;
              const wc = (await import("@/lib/cadence/contract")).walletClientFor(provider, s.chain.chainId);
              if (!wc) return;
              const res = await sendWrite(wc, pc, () =>
                wc.writeContract({
                  address: d.clob as `0x${string}`,
                  abi: clobAbiSafe(),
                  functionName: "cancelOrder",
                  args: [BigInt(id)],
                  account: s.wallet.address as `0x${string}`,
                  chain: null,
                }),
              );
              if (!res.ok) {
                setError("Cancel failed — the order may already be filled or expired.");
                return;
              }
              setNote(`Order #${id} canceled — escrow refunded.`);
              void refresh();
            } finally {
              setPendingId(null);
            }
          }} />
          <FillsPanel wired={wired} chainId={s.chain.chainId} />
          <ClobFactsPanel className="lg:col-span-1" />
        </div>
      </div>
    </main>
  );
}

function clobAbiSafe() {
  return clobAbi as unknown as import("viem").Abi;
}

function Unwired({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-3 py-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className="max-w-sm text-sm leading-6 text-muted">
        The CLOB is live on two networks. Switch (or add) the chain in your
        wallet with one click — the book activates the moment you land on it.
      </p>
      <SwitchChainRow />
    </div>
  );
}

function OrderBookPanel({
  orders,
  loading,
  wired,
  epochId,
}: {
  orders: OrderRow[];
  loading: boolean;
  wired: boolean | null;
  epochId: number | null;
}) {
  const bids = orders.filter((o) => o.side === "buy" && o.status === 1).sort((a, b) => b.price - a.price);
  const asks = orders.filter((o) => o.side === "sell" && o.status === 1).sort((a, b) => a.price - b.price);
  return (
    <Panel
      id="clob-book"
      step="live"
      title="Order book"
      caption={`Current epoch — ${epochId != null ? `#${epochId}` : "—"}. Open orders only.`}
      className=""
    >
      {wired === true ? (
        <div className="flex flex-1 flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
            <div className="bg-surface px-3 py-2">
              <p className="font-mono text-[11px] uppercase text-success">bids</p>
              <p className="mt-1 font-mono text-sm tabular-nums text-muted">{bids.length}</p>
            </div>
            <div className="bg-surface px-3 py-2">
              <p className="font-mono text-[11px] uppercase text-danger">asks</p>
              <p className="mt-1 font-mono text-sm tabular-nums text-muted">{asks.length}</p>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-px overflow-hidden rounded-md border border-border">
            {asks.slice(0, 4).map((o) => (
              <BookRow key={o.id} o={o} tone="ask" />
            ))}
            {bids.slice(0, 4).map((o) => (
              <BookRow key={o.id} o={o} tone="bid" />
            ))}
            {bids.length === 0 && asks.length === 0 ? (
              <div className="flex flex-1 items-center justify-center bg-surface-raised p-4 text-center font-mono text-xs uppercase tracking-widest text-muted">
                no open orders this epoch
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <Unwired label={wired === false ? "CLOB not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function BookRow({ o, tone }: { o: OrderRow; tone: "bid" | "ask" }) {
  return (
    <div className="flex items-center justify-between bg-surface px-3 py-2">
      <span className={`font-mono text-xs uppercase ${o.side === "buy" ? "text-success" : "text-danger"}`}>
        {o.side}
      </span>
      <span className="font-mono text-xs tabular-nums text-foreground">{fmtEth(o.price, 4)} ETH</span>
      <span className="font-mono text-xs tabular-nums text-muted">{fmtEth(o.size - o.filled, 2)} cap</span>
      <span className="font-mono text-[10px] tabular-nums text-muted">{shortAddress(o.maker)}</span>
    </div>
  );
}

function PlaceOrderPanel({
  className = "",
  wired,
  onDone,
}: {
  className?: string;
  wired: boolean | null;
  onDone: () => void;
}) {
  const s = useCadence();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [size, setSize] = useState("0.01");
  const [price, setPrice] = useState("0.001");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const num = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) : 0;
  const priceNum = Number.isFinite(Number(price)) && Number(price) > 0 ? Number(price) : 0;
  const escrow = num * priceNum;

  async function submit() {
    if (!s.chain.chainId || !s.wallet.address) return;
    setPending(true);
    setError(null);
    setNote(null);
    try {
      const d = await loadDeployment(s.chain.chainId);
      if (!d?.clob) return;
      const pc = publicClientFor(s.chain.chainId);
      const provider = (window as unknown as { ethereum: unknown }).ethereum;
      const wc = walletClientFor(provider, s.chain.chainId);
      if (!wc) return;

      if (side === "sell") {
        // escrow slots: approve the CLOB once, then place
        setApproving(true);
        const approval = await sendWrite(wc, pc, () =>
          wc.writeContract({
            address: d.slots,
            abi: slotsAbi as never,
            functionName: "setApprovalForAll",
            args: [d.clob, true],
            account: s.wallet.address as `0x${string}`,
            chain: null,
          }),
        );
        setApproving(false);
        if (!approval.ok) {
          setError("Slot approval failed — approve the CLOB for your cadence slots first.");
          return;
        }
      }

      const res = await sendWrite(wc, pc, () =>
        wc.writeContract({
          address: d.clob as `0x${string}`,
          abi: clobAbiSafe(),
          functionName: "placeOrder",
          args: [side === "buy", BigInt(epochId(s.chain.epochId)), parseUnits(String(num), 18), parseUnits(String(price), 18)],
          account: s.wallet.address as `0x${string}`,
          chain: null,
          ...(side === "buy" ? { value: parseUnits(escrow.toFixed(18), 18) } : {}),
        }),
      );
      if (!res.ok) {
        setError(describeRevert(res.selector) ?? res.message);
        return;
      }
      setNote(`${side === "buy" ? "Bid" : "Ask"} placed — order added to the book for this epoch.`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 140) : "order failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel
      id="clob-place"
      step="1 · order"
      title="Place a limit order"
      caption="Buy side escrows quote. Sell side escrows slots. Expired with the epoch."
      className={className}
    >
      {wired === true ? (
        <div className="flex flex-1 flex-col gap-4">
          <fieldset>
            <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
              side
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["buy", "sell"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={side === v}
                  onClick={() => setSide(v)}
                  className={`h-10 rounded-md border font-mono text-xs uppercase tracking-widest transition-colors duration-100 ${
                    side === v
                      ? v === "buy"
                        ? "border-success/60 bg-success/10 text-success"
                        : "border-danger/60 bg-danger/10 text-danger"
                      : "border-border text-muted hover:border-border-strong"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="clob-size"
              className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted"
            >
              size (capacity, ETH)
            </label>
            <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-3 focus-within:border-accent">
              <input
                id="clob-size"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                autoComplete="off"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="h-11 w-full bg-transparent font-mono tabular-nums text-foreground outline-none"
              />
              <EthIcon className="inline size-3 shrink-0 text-muted" />
            </div>
          </div>

          <div>
            <label
              htmlFor="clob-price"
              className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted"
            >
              limit price (ETH per ETH capacity)
            </label>
            <input
              id="clob-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.0001"
              autoComplete="off"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-11 w-full rounded-md border border-border-strong bg-surface-raised px-3 font-mono tabular-nums text-foreground outline-none focus:border-accent"
            />
          </div>
          <p className="font-mono text-xs tabular-nums text-muted">
            escrow {escrow > 0 ? `${fmtEth(escrow, 4)} ETH` : "—"}
          </p>

          <button
            type="button"
            disabled={num === 0 || priceNum === 0 || pending || !s.wallet.address}
            onClick={() => void submit()}
            className="inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Zap className="size-4" aria-hidden />
            {pending ? (approving ? "approving slots…" : "placing…") : "place order"}
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
          <p className="text-xs leading-5 text-muted">
            Orders for epoch{" "}
            <span className="font-mono tabular-nums">{s.chain.epochId != null ? `#${s.chain.epochId}` : "—"}</span>{" "}
            only — the book expires at refresh. Sell orders need a one-time ERC-1155 approval.
          </p>
        </div>
      ) : (
        <Unwired label={wired === false ? "CLOB not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function MyOrdersPanel({
  className = "",
  mine,
  wired,
  onCancel,
  pendingId,
}: {
  className?: string;
  mine: OrderRow[];
  wired: boolean | null;
  onCancel: (id: number) => Promise<void>;
  pendingId: string | null;
}) {
  return (
    <Panel
      id="clob-mine"
      step="2 · mine"
      title="My orders"
      caption="Cancel anytime before fill; everything expires at epoch refresh."
      className={className}
    >
      {wired === true ? (
        mine.length === 0 ? (
          <p className="flex flex-1 items-center justify-center py-6 text-sm text-muted">
            No orders yet — place one to see it here.
          </p>
        ) : (
          <ul className="flex flex-1 flex-col gap-px overflow-hidden rounded-md border border-border">
            {mine.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 bg-surface px-3 py-2">
                <span className="font-mono text-xs">
                  <span className={o.side === "buy" ? "text-success" : "text-danger"}>#{o.id} {o.side}</span>{" "}
                  <span className="tabular-nums text-muted">
                    {fmtEth(o.size - o.filled, 2)} @ {fmtEth(o.price, 4)}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={pendingId === `c${o.id}`}
                  onClick={() => void onCancel(o.id)}
                  className="inline-flex h-8 items-center gap-1 rounded border border-danger/50 px-2 font-mono text-[10px] uppercase text-danger transition-colors duration-100 hover:bg-danger/10 disabled:opacity-40"
                >
                  {pendingId === `c${o.id}` ? "canceling…" : "cancel"}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <Unwired label={wired === false ? "CLOB not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function FillsPanel({
  className = "",
  wired,
  chainId,
}: {
  className?: string;
  wired: boolean | null;
  chainId: number | null;
}) {
  const [fills, setFills] = useState<{ size: number; price: number; tx: `0x${string}`; block: number }[]>([]);

  useEffect(() => {
    if (wired !== true || chainId == null) return;
    let alive = true;
    void (async () => {
      const d = await loadDeployment(chainId);
      if (!d?.clob) return;
      const pc = publicClientFor(chainId);
      try {
        const logs = await pc.getLogs({
          address: d.clob,
          event: {
            type: "event",
            name: "ClobTrade",
            inputs: [
              { name: "buyId", type: "uint256", indexed: true },
              { name: "sellId", type: "uint256", indexed: true },
              { name: "buyer", type: "address", indexed: true },
              { name: "seller", type: "address", indexed: false },
              { name: "size", type: "uint256", indexed: false },
              { name: "price", type: "uint256", indexed: false },
            ],
          },
          fromBlock: BigInt(Math.max(0, Number(await pc.getBlockNumber()) - 4000)),
          toBlock: "latest",
        });
        if (!alive) return;
        const rows = logs
          .slice(-10)
          .reverse()
          .map((l) => ({
            size: Number(formatUnits((l as unknown as { args: { size: bigint } }).args.size, 18)),
            price: Number(formatUnits((l as unknown as { args: { price: bigint } }).args.price, 18)),
            tx: (l as unknown as { transactionHash: `0x${string}` }).transactionHash,
            block: (l as unknown as { blockNumber: number }).blockNumber,
          }));
        setFills(rows);
      } catch {
        /* fills read is best-effort */
      }
    })();
    return () => {
      alive = false;
    };
  }, [wired, chainId]);

  return (
    <Panel
      id="clob-fills"
      step="live"
      title="Fills"
      caption="Matched trades settle ERC-1155 slots + quote escrow atomically."
      className="lg:col-span-2"
    >
      {wired === true ? (
        <FillList fills={fills} />
      ) : (
        <Unwired label={wired === false ? "CLOB not deployed yet" : "checking chain…"} />
      )}
    </Panel>
  );
}

function ClobFactsPanel({ className = "" }: { className?: string }) {
  const FACTS = [
    ["Expiring book", "Open orders die at epoch refresh — capacity has a clock."],
    ["Atomic settle", "Slots and quote escrow swap in one transaction."],
    ["Not equity", "A slot on the book is a capacity ticket, not an LP share."],
    ["Primary first", "Mint on /buy, then trade — the book wraps the primary market."],
  ] as const;
  return (
    <Panel id="clob-facts" title="How the CLOB works" className={className}>
      <div className="grid flex-1 gap-5 sm:grid-cols-2">
        {FACTS.map(([t, b]) => (
          <div key={t}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{t}</p>
            <p className="mt-1.5 text-sm leading-6 text-muted">{b}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function epochId(v: number | null): number {
  return v ?? 0;
}

function FillList({ fills }: { fills: { size: number; price: number; tx: `0x${string}`; block: number }[] }) {
  if (fills.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center py-6 text-sm text-muted">
        No fills yet this epoch.
      </p>
    );
  }
  return (
    <ul className="flex flex-1 flex-col gap-px overflow-hidden rounded-md border border-border">
      {fills.map((f) => (
        <li key={f.tx} className="flex items-center justify-between bg-surface px-4 py-2.5">
          <span className="font-mono text-xs tabular-nums text-foreground">
            {fmtEth(f.size, 3)} <EthIcon className="inline size-3" /> @ {fmtEth(f.price, 4)} ETH
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted">
            block {f.block} · {shortAddress(f.tx)}
          </span>
        </li>
      ))}
    </ul>
  );
}
