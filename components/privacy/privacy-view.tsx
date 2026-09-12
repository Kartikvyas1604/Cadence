"use client";

import { useCallback, useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Panel } from "@/components/panel";
import { PrivateIntentPanel } from "@/components/private-intent-panel";
import { useCadence } from "@/lib/cadence/provider";
import { publicClientFor } from "@/lib/cadence/contract";
import { loadDeployment, slotsAbi } from "@/lib/cadence/abis";
import {
  commitFromEphemeral,
  createEphemeral,
  fundEphemeral,
  revealFromEphemeral,
  sweep,
  walletFromProvider,
  type StealthSession,
} from "@/lib/stealth";
import { fmtEth } from "@/lib/cadence/format";
import { shortHash } from "@/lib/cadence/hash";
import { formatUnits, parseUnits } from "viem";
import {
  fetchShieldStatus,
  shieldFunds,
  unshieldFunds,
  type ShieldStatus,
} from "@/lib/shield/client";

/**
 * Privacy page (Extended §§3/5/7): Private Cadence Intent (beat #2),
 * stealth/ephemeral payer wallets, and the Aztec/Railgun fund path.
 * One line holds the honesty: shields funds, not the swap.
 */
export function PrivacyView() {
  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6 lg:px-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          capacity privacy
        </p>
        <h1 className="font-serif text-4xl tracking-tight text-foreground md:text-5xl">
          Hide the intent. Never the venue.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base md:leading-7">
          Commit your size before anyone sees it, mint from a one-shot wallet,
          or fund through a shielded pool. The swap itself stays public — that
          is where the reject path lives.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <PrivateIntentPanel className="lg:col-span-2" />
          <StealthWalletPanel className="lg:col-span-1" />
          <ShieldFundPanel className="lg:col-span-2" />
          <PrivacyFactsPanel className="lg:col-span-1" />
        </div>
      </div>
    </div>
  );
}

/** Extended §5 — stealth / ephemeral payer: one-shot key, fund, commit, reveal, sweep. */
function StealthWalletPanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const [session, setSession] = useState<StealthSession | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "commit" | "reveal" | "sweep">(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<{
    H: `0x${string}`;
    salt: `0x${string}`;
    sizeEth: number;
  } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [sweepTo, setSweepTo] = useState<string>("");

  const refreshBalance = useCallback(async () => {
    if (!session || s.chain.chainId == null) return;
    const pc = publicClientFor(s.chain.chainId);
    try {
      const wei = (await pc.getBalance({
        address: session.account.address as `0x${string}`,
      })) as bigint;
      setBalance(fmtEth(Number(formatUnits(wei, 18)), 4));
    } catch {
      setBalance(null);
    }
  }, [session, s.chain.chainId]);

  // poll the ephemeral balance every 4s — a fund tx mined after the initial
  // read would otherwise never surface, leaving the commit button dead
  useEffect(() => {
    if (!session) return;
    queueMicrotask(() => void refreshBalance());
    const t = setInterval(() => void refreshBalance(), 4_000);
    return () => clearInterval(t);
  }, [refreshBalance]);

  // default the sweep destination to the connected wallet once known
  useEffect(() => {
    if (s.wallet.address) {
      queueMicrotask(() => setSweepTo((prev) => (prev ? prev : s.wallet.address!)));
    }
  }, [s.wallet.address]);

  // final guard: a tab closing with funded ETH on a memory-only key is loss
  const hasFunds = balance != null && Number(balance) > 0.000001;
  useEffect(() => {
    if (!session || !hasFunds) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [session, hasFunds]);

  async function fund(amount: string) {
    if (!session) return;
    setError(null);
    setNote(null);
    const provider = (window as unknown as { ethereum: unknown }).ethereum;
    const funder = walletFromProvider(provider);
    if (!funder) {
      setError("No injected wallet found — connect first to fund.");
      return;
    }
    if (!s.chain.chainId) {
      setError("Connect to a chain with a deployment first.");
      return;
    }
    if (!s.wallet.address) {
      setError("Wallet not connected — connect before funding the ephemeral wallet.");
      return;
    }
    try {
      // explicit `from` — several injected wallets reject a from-less
      // eth_sendTransaction with RPC -32602
      await fundEphemeral(funder, session, amount, s.wallet.address as `0x${string}`);
      setNote(`Funded with ${amount} ETH.`);
      void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 140) : "fund failed");
    }
  }

  async function commitFromSession(sizeEth: number) {
    if (!session || busy) return;
    setError(null);
    setNote(null);
    if (s.chain.chainId == null) {
      setError("Connect to a chain with a deployment first.");
      return;
    }
    setBusy("commit");
    try {
      const deployment = await loadDeployment(s.chain.chainId);
      if (!deployment) {
        setError("No Cadence deployment found for this chain — switch networks.");
        return;
      }
      const pc = publicClientFor(s.chain.chainId);
      const epochId = Number(
        await pc.readContract({
          address: deployment.slots,
          abi: slotsAbi,
          functionName: "currentEpoch",
        }),
      );
      const priceWei = await pc.readContract({
        address: deployment.slots,
        abi: slotsAbi,
        functionName: "pricePerEth",
      }) as bigint;
      const sizeWei = parseUnits(String(sizeEth), 18);
      // same 3× reserve the provider path uses — bounds the escrow leak
      const escrow = (sizeWei * priceWei * 3n) / parseUnits("1", 18);
      const salt = `0x${Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("")}` as `0x${string}`;
      const { H, txHash } = await commitFromEphemeral(
        session,
        { deployment, pc, chainId: s.chain.chainId },
        { sizeWei, epochId, salt, escrowWei: escrow },
      );
      setCommitment({ H, salt, sizeEth });
      setNote(
        `Committed — the payer of record onchain is the one-shot address. tx ${txHash.slice(0, 10)}…`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 220) : "ephemeral commit failed");
    } finally {
      setBusy(null);
    }
  }

  async function revealFromSession() {
    if (!session || busy || !commitment) return;
    setError(null);
    setNote(null);
    if (s.chain.chainId == null) {
      setError("Connect to a chain with a deployment first.");
      return;
    }
    setBusy("reveal");
    try {
      const deployment = await loadDeployment(s.chain.chainId);
      if (!deployment) {
        setError("No Cadence deployment found for this chain — switch networks.");
        return;
      }
      const pc = publicClientFor(s.chain.chainId);
      const txHash = await revealFromEphemeral(
        session,
        { deployment, pc, chainId: s.chain.chainId },
        { sizeEth: commitment.sizeEth, salt: commitment.salt },
      );
      setCommitment(null);
      setNote(
        `Revealed & swapped — USDC and the escrow refund landed on the ephemeral wallet. Sweep them back. tx ${txHash.slice(0, 10)}…`,
      );
      void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 220) : "ephemeral reveal failed");
    } finally {
      setBusy(null);
    }
  }

  async function sweepBack() {
    if (!session || busy) return;
    setError(null);
    setNote(null);
    if (s.chain.chainId == null) {
      setError("Connect to a chain with a deployment first.");
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(sweepTo)) {
      setError("Enter a valid sweep destination address.");
      return;
    }
    setBusy("sweep");
    try {
      const result = await sweep(session, sweepTo as `0x${string}`, s.chain.chainId);
      if (result) {
        setNote(
          `Swept ${formatUnits(result.sweptWei, 18)} ETH back to the main wallet. tx ${result.txHash.slice(0, 10)}…`,
        );
      } else {
        setNote("Nothing worth sweeping — balance is at or below the gas reserve.");
      }
      void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 220) : "sweep failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      id="privacy-stealth"
      step="stealth payer"
      title="Mint from a one-shot wallet"
      caption="A fresh ephemeral key pays for the slot — your main wallet stays out of the mint."
      className={className}
    >
      <div className="flex flex-1 flex-col gap-4">
        {session ? (
          <LpNotice kind="warn">
            The key lives in this tab only. Refresh, navigate away, or discard —
            and any ETH left on it is unrecoverable. Sweep before you leave.
          </LpNotice>
        ) : null}

        {session ? (
          <>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
                ephemeral address
              </p>
              <p className="mt-1 break-all font-mono text-sm tabular-nums text-accent-strong">
                {session.account.address}
              </p>
              <p className="mt-1 font-mono text-xs tabular-nums text-muted">
                balance {balance ?? "—"} ETH
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {["0.05", "0.1"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => void fund(v)}
                  disabled={busy !== null}
                  className="h-11 rounded-md border border-border-strong px-4 font-mono text-xs tabular-nums text-foreground transition-colors duration-100 hover:border-accent hover:text-accent-strong disabled:pointer-events-none disabled:opacity-50"
                >
                  fund {v} ETH
                </button>
              ))}
              <button
                type="button"
                disabled={busy !== null || !hasFunds || s.chain.chainId == null}
                onClick={() => void commitFromSession(0.01)}
                aria-busy={busy === "commit"}
                className="h-11 rounded-md bg-info px-4 font-mono text-xs tabular-nums text-background transition-opacity duration-100 hover:opacity-90 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
              >
                {busy === "commit" ? "Committing…" : "commit 0.01 from ephemeral"}
              </button>
            </div>

            {commitment ? (
              <div className="rounded-md border border-info/40 bg-info/5 p-3">
                <p className="font-mono text-[11px] uppercase tracking-widest text-info">
                  ephemeral intent live
                </p>
                <p className="mt-1 truncate font-mono text-xs tabular-nums text-foreground">
                  H {shortHash(commitment.H)} · size hidden until reveal
                </p>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void revealFromSession()}
                  aria-busy={busy === "reveal"}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
                >
                  {busy === "reveal" ? "Revealing…" : "Reveal & swap from ephemeral"}
                </button>
                <p className="mt-2 text-xs leading-5 text-muted">
                  The same one-shot key must reveal — the hook checks payer ==
                  trader. USDC lands on the ephemeral wallet, then you sweep.
                </p>
              </div>
            ) : null}

            <div>
              <label
                htmlFor="sweep-to"
                className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted"
              >
                sweep destination (your main wallet)
              </label>
              <input
                id="sweep-to"
                type="text"
                value={sweepTo}
                onChange={(e) => setSweepTo(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="h-10 w-full rounded-md border border-border-strong bg-surface-raised px-3 font-mono text-xs tabular-nums text-foreground transition-colors duration-100 focus-visible:border-accent"
                placeholder="0x…"
              />
              <button
                type="button"
                disabled={busy !== null || !hasFunds || !/^0x[0-9a-fA-F]{40}$/.test(sweepTo)}
                onClick={() => void sweepBack()}
                aria-busy={busy === "sweep"}
                className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-md border border-border-strong px-4 font-mono text-xs tabular-nums text-foreground transition-colors duration-100 hover:border-accent hover:text-accent-strong disabled:pointer-events-none disabled:opacity-50"
              >
                {busy === "sweep" ? "Sweeping…" : "sweep leftovers"}
              </button>
            </div>

            {note ? <LpNotice kind="success">{note}</LpNotice> : null}
            {error ? <LpNotice kind="error">{error}</LpNotice> : null}

            {confirmDiscard ? (
              <div className="rounded-md border border-danger/50 bg-danger/5 p-3">
                <p className="flex items-start gap-1.5 text-xs leading-5 text-danger" role="alert">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {hasFunds
                    ? `This wallet still holds ${balance} ETH. Discarding destroys the key — the funds become unrecoverable.`
                    : "Discarding destroys the key permanently."}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSession(null);
                      setBalance(null);
                      setNote(null);
                      setError(null);
                      setCommitment(null);
                      setConfirmDiscard(false);
                    }}
                    className="h-9 flex-1 rounded-md bg-danger px-3 text-xs font-medium text-background transition-opacity duration-100 hover:opacity-90"
                  >
                    destroy key
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDiscard(false)}
                    className="h-9 flex-1 rounded-md border border-border px-3 text-xs text-muted transition-colors duration-100 hover:bg-surface-raised hover:text-foreground"
                  >
                    keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDiscard(true)}
                disabled={busy !== null}
                className="h-11 rounded-md border border-border px-4 text-sm text-muted transition-colors duration-100 hover:bg-surface-raised hover:text-danger disabled:pointer-events-none disabled:opacity-50"
              >
                discard
              </button>
            )}

            <p className="text-xs leading-5 text-muted">
              Nothing touches your main wallet: the ephemeral key commits the
              mint, reveals the swap, and sweeps what&apos;s left back.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted">
              Generate a one-shot wallet locally. Nothing touches your main
              wallet — the ephemeral key commits, reveals, and pays, then
              sweeps what&apos;s left.
            </p>
            <button
              type="button"
              onClick={() => setSession(createEphemeral())}
              className="inline-flex h-11 min-w-40 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px"
            >
              create ephemeral wallet
            </button>
          </>
        )}
      </div>
    </Panel>
  );
}

/** Extended §7 — Aztec/Railgun fund path: shield → fund → commit. */
function ShieldFundPanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const [protocol, setProtocol] = useState<"railgun" | "aztec">("railgun");
  const [status, setStatus] = useState<ShieldStatus | null>(null);
  const [amount, setAmount] = useState<string>("0.05");
  const [busy, setBusy] = useState<null | "shield" | "unshield">(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [step, setStep] = useState(0); // advances only on real, settled txs

  const STEPS = [
    ["1 · shield", "Shield funds into your Railgun/Aztec private balance."],
    ["2 · fund", "Unshield to the ephemeral wallet that pays for the slot."],
    ["3 · commit", "commitMint(H) from the ephemeral wallet — size hidden."],
  ] as const;

  useEffect(() => {
    let alive = true;
    fetchShieldStatus()
      .then((st) => {
        if (alive) setStatus(st);
      })
      .catch(() => {
        /* status route unreachable — panel stays in the honest unset state */
      });
    return () => {
      alive = false;
    };
  }, []);

  const adapterStatus = status?.[protocol];
  const configured = adapterStatus?.configured ?? false;

  async function run(op: "shield" | "unshield") {
    if (busy) return;
    setError(null);
    setNote(null);
    if (op === "unshield" && !s.wallet.address) {
      setError("Connect your wallet first — unshield needs a payer address.");
      return;
    }
    setBusy(op);
    try {
      if (op === "shield") {
        const r = await shieldFunds({ protocol, amountEth: amount });
        if (r.tx) {
          setStep((prev) => Math.max(prev, 1));
          setNote(`Shielded ${amount} ETH — tx ${r.tx.slice(0, 10)}…`);
        } else {
          setNote(r.note || "Shield populated but nothing settled — nothing was faked.");
        }
      } else {
        const r = await unshieldFunds({
          protocol,
          amountEth: amount,
          to: s.wallet.address as string,
        });
        if (r.tx) {
          setStep((prev) => Math.max(prev, 2));
          setNote(`Unshielded ${amount} ETH to the payer wallet — tx ${r.tx.slice(0, 10)}…`);
        } else {
          setNote(r.note || "Unshield populated but nothing settled — nothing was faked.");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 240) : `${op} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel
      id="privacy-shield"
      step="fund path"
      title="Shield the funding, not the swap"
      caption="Aztec / Railgun path: private balance in, cadence slot out, public swap."
      className={className}
    >
      <div className="flex flex-1 flex-col gap-4">
        <fieldset>
          <legend className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
            adapter
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["railgun", "aztec"] as const).map((v) => {
              const st = status?.[v];
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={protocol === v}
                  onClick={() => setProtocol(v)}
                  className={`h-10 rounded-md border font-mono text-xs uppercase tracking-widest transition-colors duration-100 ${
                    protocol === v
                      ? "border-accent/60 bg-accent/10 text-accent-strong"
                      : "border-border text-muted hover:border-border-strong"
                  }`}
                >
                  {v}
                  {st ? (
                    <span
                      className={`ml-2 inline-block size-1.5 rounded-full ${
                        st.configured ? "bg-success" : "bg-muted/50"
                      }`}
                      title={st.configured ? "configured" : "not configured on this deployment"}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>

        <ol className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
          {STEPS.map(([t, b], i) => (
            <li
              key={t}
              className={`bg-surface p-4 ${i === step ? "outline outline-1 outline-accent/40" : ""}`}
            >
              <p className="font-mono text-[11px] uppercase tracking-widest text-accent">{t}</p>
              <p className="mt-1.5 text-sm leading-6 text-muted">{b}</p>
            </li>
          ))}
        </ol>

        {configured ? (
          <>
            <div>
              <label
                htmlFor="shield-amount"
                className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted"
              >
                amount (ETH)
              </label>
              <input
                id="shield-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10 w-full rounded-md border border-border-strong bg-surface-raised px-3 font-mono text-sm tabular-nums text-foreground transition-colors duration-100 focus-visible:border-accent"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null || !amount}
                onClick={() => void run("shield")}
                aria-busy={busy === "shield"}
                className="h-11 flex-1 rounded-md bg-info px-4 text-sm font-medium text-background transition-opacity duration-100 hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
              >
                {busy === "shield" ? "Shielding…" : "shield into private balance"}
              </button>
              <button
                type="button"
                disabled={busy !== null || !amount || !s.wallet.address}
                onClick={() => void run("unshield")}
                aria-busy={busy === "unshield"}
                className="h-11 flex-1 rounded-md border border-border-strong px-4 text-sm font-medium text-foreground transition-colors duration-100 hover:border-accent hover:text-accent-strong disabled:pointer-events-none disabled:opacity-50"
              >
                {busy === "unshield" ? "Unshielding…" : "unshield to payer"}
              </button>
            </div>
          </>
        ) : (
          <LpNotice kind="warn">
            {adapterStatus
              ? `${protocol} is not configured on this deployment (${adapterStatus.missing} env var(s) missing). Calls fail closed — funds are NOT moved. The commit-reveal paths on this page work today.`
              : "Checking adapter configuration…"}
          </LpNotice>
        )}

        {note ? <LpNotice kind="success">{note}</LpNotice> : null}
        {error ? <LpNotice kind="error">{error}</LpNotice> : null}

        <p className="text-xs leading-5 text-muted">
          Shields funds, not the swap. The beforeSwap gate and reject paths stay
          public — that is the mechanism.
        </p>
      </div>
    </Panel>
  );
}

function PrivacyFactsPanel({ className = "" }: { className?: string }) {
  const FACTS = [
    ["Commitment, not darkness", "H = hash(size, epochId, salt) goes onchain; the size reveals at fill — not private forever."],
    ["Upper bound, disclosed", "The escrow shows an upper bound on size. Exact size stays hidden until reveal."],
    ["Payer privacy", "A one-shot wallet separates your identity from the purchase."],
    ["Venue stays lit", "Rejects, fills and capacity supply remain fully public."],
  ] as const;
  return (
    <Panel id="privacy-facts" title="What is private — and what is not" className={className}>
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

function LpNotice({ kind, children }: { kind: "warn" | "error" | "success"; children: React.ReactNode }) {
  const style =
    kind === "warn"
      ? "border-info/50 bg-info/5 text-info"
      : kind === "error"
        ? "border-danger/50 bg-danger/5 text-danger"
        : "border-success/50 bg-success/5 text-success";
  return (
    <p role="status" className={`rounded-md border px-3 py-2 text-xs leading-5 ${style}`}>
      {children}
    </p>
  );
}
