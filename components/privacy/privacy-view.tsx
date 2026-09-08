"use client";

import { useState } from "react";
import { Panel } from "@/components/panel";
import { PrivateIntentPanel } from "@/components/private-intent-panel";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

/**
 * Privacy page (Extended §§3/5/7): Private Cadence Intent (beat #2),
 * stealth/ephemeral payer wallets, and the Aztec/Railgun fund path.
 * One line holds the honesty: shields funds, not the swap.
 */
export function PrivacyView() {
  return (
    <main className="flex-1">
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
    </main>
  );
}

/** Extended §5 — stealth / ephemeral payer: one-shot key, fund, mint, sweep. */
function StealthWalletPanel({ className = "" }: { className?: string }) {
  const [ephemeral, setEphemeral] = useState<{ address: string } | null>(null);

  return (
    <Panel
      id="privacy-stealth"
      step="stealth payer"
      title="Mint from a one-shot wallet"
      caption="A fresh ephemeral key pays for the slot — your main wallet stays out of the mint."
      className={className}
    >
      <div className="flex flex-1 flex-col gap-4">
        {ephemeral ? (
          <>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
                ephemeral address
              </p>
              <p className="mt-1 break-all font-mono text-sm tabular-nums text-accent-strong">
                {ephemeral.address}
              </p>
            </div>
            <LpNotice kind="warn">
              Fund this address with enough ETH to cover the slot ask, then
              commit from it. The key lives in this tab only — never persisted.
            </LpNotice>
            <p className="text-xs leading-5 text-muted">
              Fund, then commit-mint from the ephemeral account. Sweeping the
              remainder back is optional and happens after the fill.
            </p>
            <button
              type="button"
              onClick={() => setEphemeral(null)}
              className="h-11 rounded-md border border-border-strong px-5 text-sm text-foreground transition-colors duration-100 hover:bg-surface-raised"
            >
              discard this wallet
            </button>
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
              onClick={() => {
                const acct = privateKeyToAccount(generatePrivateKey());
                setEphemeral({ address: acct.address });
              }}
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
          Adapter not wired on this chain yet — the Railgun / Aztec shield and
          unshield calls land with lib/railgun and lib/aztec. The commit-reveal
          path above works today.
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
