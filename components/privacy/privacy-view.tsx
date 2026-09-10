"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/panel";
import { PrivateIntentPanel } from "@/components/private-intent-panel";
import { useCadence } from "@/lib/cadence/provider";
import { publicClientFor } from "@/lib/cadence/contract";
import { createEphemeral, fundEphemeral, walletFromProvider, type StealthSession } from "@/lib/stealth";
import { fmtEth } from "@/lib/cadence/format";
import { formatUnits } from "viem";

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

/** Extended §5 — stealth / ephemeral payer: one-shot key, fund, commit, sweep. */
function StealthWalletPanel({ className = "" }: { className?: string }) {
  const s = useCadence();
  const [session, setSession] = useState<StealthSession | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  useEffect(() => {
    queueMicrotask(() => void refreshBalance());
  }, [refreshBalance]);

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
    try {
      await fundEphemeral(funder, session, amount);
      setNote(`Funded with ${amount} ETH.`);
      void refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message.slice(0, 140) : "fund failed");
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
              {["0.01", "0.05"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => void fund(v)}
                  className="h-11 rounded-md border border-border-strong px-4 font-mono text-xs tabular-nums text-foreground transition-colors duration-100 hover:border-accent hover:text-accent-strong"
                >
                  fund {v} ETH
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSession(null);
                  setBalance(null);
                  setNote(null);
                  setError(null);
                }}
                className="h-11 rounded-md border border-border px-4 text-sm text-muted transition-colors duration-100 hover:bg-surface-raised hover:text-danger"
              >
                discard
              </button>
            </div>
            {note ? (
              <LpNotice kind="success">{note}</LpNotice>
            ) : null}
            {error ? (
              <LpNotice kind="error">{error}</LpNotice>
            ) : null}
            <p className="text-xs leading-5 text-muted">
              The key lives in this tab only — never persisted, no KYC. Fund it,
              then commit-mint from the ephemeral account and sweep the rest.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm leading-6 text-muted">
              Generate a one-shot wallet locally. Nothing touches your main
              wallet — the ephemeral key funds the commit-mint and the x402
              payment, then sweeps what&apos;s left.
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
  const [protocol, setProtocol] = useState<"railgun" | "aztec">("railgun");
  const [step] = useState(0); // adapter wiring lands with the lib adapters

  const STEPS = [
    ["1 · shield", "Shield funds into your Railgun/Aztec private balance."],
    ["2 · fund", "Unshield to the ephemeral wallet that pays for the slot."],
    ["3 · commit", "commitMint(H) from the ephemeral wallet — size hidden."],
  ] as const;

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
            {(["railgun", "aztec"] as const).map((v) => (
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
              </button>
            ))}
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

        <LpNotice kind="warn">
          Railgun is wired behind env gating — the real SDK flow runs when
          RAILGUN_* env is set on this deployment, and every call with env
          unset fails closed naming the missing vars. Aztec lands when
          AZTEC_NODE_URL + AZTEC_ACCOUNT_SECRET are configured. The
          commit-reveal path above works today.
        </LpNotice>

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
