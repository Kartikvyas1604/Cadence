"use client";

import { useEffect, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { Panel } from "@/components/panel";
import { EthIcon } from "@/components/eth-icon";
import { useCadence, useCadenceActions } from "@/lib/cadence/provider";
import { useModuleProbe } from "@/lib/cadence/use-module-probe";
import { adminAbi, loadDeployment } from "@/lib/cadence/abis";
import { publicClientFor } from "@/lib/cadence/contract";
import { fmtEth } from "@/lib/cadence/format";

/**
 * Admin / protocol treasury (Extended §8): the 10% take of every slot sale,
 * accrued on-chain, withdrawable by the treasury role. LP revenue vs
 * protocol cut shown side by side — never conflated.
 */
export function AdminView() {
  const s = useCadence();
  const { withdrawProtocolRevenue } = useCadenceActions();
  const wired = useModuleProbe(s.chain.chainId, (d) => d.hook, adminAbi, "accruedProtocolRevenue");

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          protocol treasury
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          The venue&apos;s cut, on the books.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          Every cadence slot sale splits: LP revenue share plus the protocol
          take. Both ledgers are visible here and on the LP desk — one number
          each, no mixing.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <TreasuryPanel className="lg:col-span-2" wired={wired} />
          <SplitPanel className="lg:col-span-1" wired={wired} />
        </div>
      </div>
    </div>
  );
}

function Unwired({ label }: { label: string }) {
  return (
    <p className="text-xs leading-5 text-muted">{label}</p>
  );
}

function TreasuryPanel({
  className = "",
  wired,
}: {
  className?: string;
  wired: boolean | null;
}) {
  const s = useCadence();
  const { withdrawProtocolRevenue, setProtocolTreasury } = useCadenceActions();
  const [pending, setPending] = useState(false);
  const [accrued, setAccrued] = useState<number | null>(null);
  const [treasury, setTreasury] = useState<string | null>(null);
  const [nextTreasury, setNextTreasury] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isTreasury =
    treasury != null &&
    s.wallet.address != null &&
    treasury.toLowerCase() === s.wallet.address.toLowerCase();

  useEffect(() => {
    if (wired !== true || s.chain.chainId == null) return;
    let alive = true;
    (async () => {
      const d = await loadDeployment(s.chain.chainId as number);
      if (!d || !alive) return;
      const pc = publicClientFor(s.chain.chainId as number);
      try {
        const [rev, who] = await Promise.all([
          pc.readContract({ address: d.hook, abi: adminAbi, functionName: "accruedProtocolRevenue" }) as Promise<bigint>,
          pc.readContract({ address: d.hook, abi: adminAbi, functionName: "protocolTreasury" }) as Promise<string>,
        ]);
        if (!alive) return;
        setAccrued(Number(rev) / 1e18);
        setTreasury(who);
      } catch {
        /* keep last */
      }
    })();
    return () => {
      alive = false;
    };
  }, [wired, s.chain.chainId, s.chain.blockNumber]);

  return (
    <Panel
      id="admin-treasury"
      step="live"
      title="Protocol revenue"
      caption="protocolTakeBps of every SlotSold, accrued per epoch. Withdrawable by the treasury role."
      className={className}
    >
      {wired === true ? (
        <div className="flex flex-1 flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-surface-raised p-4">
              <p className="font-mono text-[11px] uppercase tracking-widest text-accent">
                accrued take
              </p>
              <p className="mt-1 font-mono text-2xl tabular-nums text-accent-strong">
                {accrued != null ? fmtEth(accrued) : "—"}{" "}
                <span className="inline-flex items-center gap-1 text-sm text-muted">
                  <EthIcon /> ETH
                </span>
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface-raised p-4">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
                treasury (on-chain)
              </p>
              <p className="mt-1 break-all font-mono text-sm tabular-nums text-foreground">
                {treasury ?? "—"}
              </p>
              <p className="mt-1 font-mono text-[10px] tabular-nums text-muted">
                {treasury ? `${treasury.slice(0, 8)}…${treasury.slice(-6)}` : "—"}
              </p>
            </div>
          </div>

          {/* connected account + authorization state */}
          <div className="rounded-md border border-border bg-surface-raised p-4">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
              connected account
            </p>
            {s.wallet.address ? (
              <>
                <p className="mt-1 break-all font-mono text-sm tabular-nums text-foreground">
                  {s.wallet.address}
                </p>
                {isTreasury ? (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-success/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-success">
                    <Check className="size-3" aria-hidden /> you are the treasury — withdraw enabled
                  </p>
                ) : (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-danger/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-danger">
                    not the treasury — withdraw disabled
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">
                Connect the treasury wallet to withdraw the accrued take.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={!isTreasury || pending || (accrued ?? 0) <= 0}
            onClick={async () => {
              setError(null);
              setPending(true);
              try {
                await withdrawProtocolRevenue();
              } catch (e) {
                setError(
                  e instanceof Error
                    ? `withdraw failed: ${e.message.slice(0, 140)}`
                    : "withdraw failed",
                );
              } finally {
                setPending(false);
              }
            }}
            className="inline-flex h-11 min-w-44 items-center justify-center self-start rounded-md border border-border-strong bg-surface-raised px-5 text-sm font-medium text-foreground transition-colors duration-100 hover:bg-accent/10 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "withdrawing…" : "withdraw to treasury"}
          </button>
          {isTreasury ? (
            <div className="rounded-md border border-border bg-surface-raised p-4">
              <label
                htmlFor="next-treasury"
                className="mb-2 block font-mono text-[11px] uppercase tracking-widest text-muted"
              >
                rotate treasury (current treasury only)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="next-treasury"
                  type="text"
                  placeholder="0x…"
                  autoComplete="off"
                  value={nextTreasury}
                  onChange={(e) => setNextTreasury(e.target.value)}
                  className="h-11 min-w-56 flex-1 rounded-md border border-border-strong bg-surface px-3 font-mono text-xs tabular-nums text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus:border-accent"
                />
                <button
                  type="button"
                  disabled={!nextTreasury.startsWith("0x") || nextTreasury.length !== 42 || pending}
                  onClick={async () => {
                    setError(null);
                    setPending(true);
                    try {
                      await setProtocolTreasury(nextTreasury);
                      setNextTreasury("");
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? `treasury rotation failed: ${e.message.slice(0, 140)}`
                          : "treasury rotation failed",
                      );
                    } finally {
                      setPending(false);
                    }
                  }}
                  className="h-11 rounded-md border border-border-strong bg-surface-raised px-4 text-sm text-foreground transition-colors duration-100 hover:bg-accent/10 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40"
                >
                  transfer
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted">
                Production: assign a Safe multisig, never an EOA.
              </p>
            </div>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-md border border-danger/50 bg-danger/5 p-2.5 text-xs leading-5 text-danger"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}
          <p className="text-xs leading-5 text-muted">
            Withdraw is treasury-only{isTreasury ? "" : " — connect the treasury wallet to enable"}. Slot
            revenue (LPs) and swap fees are separate ledgers and never route
            through here.
          </p>
        </div>
      ) : (
        <Unwired
          label={
            wired === false
              ? "Protocol-take accounting is not on this deployment yet — proceeds currently go 100% to LPs by the deploy default."
              : "checking chain…"
          }
        />
      )}
    </Panel>
  );
}

function SplitPanel({
  className = "",
  wired,
}: {
  className?: string;
  wired: boolean | null;
}) {
  const s = useCadence();
  const lpShare = s.lp.slotRevenueShareBps;
  const protocolShare = lpShare != null ? 10_000 - lpShare : null;

  return (
    <Panel
      id="admin-split"
      step="split"
      title="Sale split"
      caption="Every SlotSold: LP pool vs protocol take. Defaults 90/10 per spec."
      className={className}
    >
      <div className="flex flex-1 flex-col gap-4">
        <div
          className="h-3 w-full overflow-hidden rounded-full border border-border bg-surface-raised"
          role="img"
          aria-label={
            lpShare != null
              ? `LP share ${lpShare / 100} percent, protocol take ${protocolShare! / 100} percent`
              : "Sale split unknown"
          }
        >
          <div
            className="h-full bg-accent"
            style={{ width: `${lpShare != null ? lpShare / 100 : 0}%` }}
          />
        </div>
        <dl className="grid grid-cols-2 gap-4 font-mono text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted">to LPs</dt>
            <dd className="mt-1 text-lg tabular-nums text-accent-strong">
              {lpShare != null ? `${lpShare / 100}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-muted">protocol</dt>
            <dd className="mt-1 text-lg tabular-nums text-info">
              {protocolShare != null ? `${protocolShare / 100}%` : "—"}
            </dd>
          </div>
        </dl>
        {wired === false ? (
          <Unwired label="Split reads arrive with the protocol-take module." />
        ) : null}
        <p className="mt-auto border-t border-border pt-3 text-xs leading-5 text-muted">
          Swap fees are a third ledger entirely — LP revenue, never the
          protocol take.
        </p>
      </div>
    </Panel>
  );
}
