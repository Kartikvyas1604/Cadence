import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Ban } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { REJECT_REASONS } from "@/lib/apron/types";

export const metadata: Metadata = {
  title: "Protocol — Apron",
  description:
    "Active/passive reserves, the λ split, epoch refresh, and the beforeSwap apron-slot gate. How Apron works.",
};

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-12 first:border-t-0 first:pt-0">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
        {kicker}
      </p>
      <h2 className="mt-2 font-serif text-3xl tracking-tight text-foreground md:text-4xl">
        {title}
      </h2>
      <div className="mt-4 max-w-prose text-sm leading-7 text-muted md:text-base md:leading-8">
        {children}
      </div>
    </section>
  );
}

export default function ProtocolPage() {
  return (
    <>
      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-16 md:px-6 md:py-20 lg:px-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            the mechanism
          </p>
          <h1 className="mt-2 font-serif text-5xl leading-[1.05] tracking-tight text-foreground md:text-6xl">
            Depth you can{" "}
            <em className="italic text-accent-strong">gate.</em>
          </h1>
          <p className="mt-5 max-w-prose text-base leading-7 text-muted md:text-lg md:leading-8">
            Apron partitions a Uniswap v4 pool into active and passive reserves
            every epoch, then sells the right to touch the active side as
            ERC-1155 apron slots. No slot, no fill — the hook reverts before the
            swap reaches the pool.
          </p>

          <Section kicker="01 · the problem" title="Free depth is drained for free">
            <p>
              In a constant-function pool, an arbitrageur who spots a stale
              price can drain the full depth in one block. The LP eats the loss
              — LVR — while the arb keeps the spread. The status quo for deciding{" "}
              <em className="italic text-foreground/90">who gets depth</em> is a
              gas race, JIT liquidity, or a private RFQ desk. None of those pay
              the LP for the capacity they are giving away.
            </p>
          </Section>

          <Section kicker="02 · the split" title="Active vs passive, every epoch">
            <p>
              Each epoch, total eligible reserves are split by a fixed ratio{" "}
              <span className="font-mono text-accent-strong">λ</span> (here,{" "}
              <span className="font-mono text-foreground">25%</span> active). The
              active side is tradable this epoch. The passive side stays locked
              until refresh — it cannot be reached by splitting an order across
              blocks in the same epoch.
            </p>
            <div className="mt-6" aria-hidden>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-raised ring-1 ring-border">
                <div className="h-full w-1/4 bg-accent" />
              </div>
              <div className="mt-2 flex justify-between font-mono text-xs text-muted">
                <span>
                  active · <span className="text-accent-strong">λ = 25%</span> ·
                  tradable this epoch
                </span>
                <span>passive · locked until refresh</span>
              </div>
            </div>
          </Section>

          <Section kicker="03 · the refresh" title="Every epoch, the clock resets">
            <p>
              On refresh, active reserves are recomputed from the new total,{" "}
              <span className="font-mono text-foreground">
                every un-consumed apron slot is burned
              </span>
              , and a fresh capacity budget is minted for the new epoch. Scarcity
              is real: capacity you don&apos;t use, you lose. That expiry is the
              honesty of the instrument — a slot is a time-slice, not equity.
            </p>
          </Section>

          <Section kicker="04 · the gate" title="beforeSwap is the product">
            <p>Three checks run before any swap touches the pool:</p>
            <ol className="mt-4 space-y-3">
              {[
                [
                  "require slot ≥ size",
                  "The caller (or router payer) must hold an apron slot for the current epoch with capacity ≥ trade size.",
                ],
                [
                  "burn / lock the notional",
                  "The consumed capacity is burned from the slot — capacity is single-use per epoch.",
                ],
                [
                  "fill against active only",
                  "The swap executes against active reserves. Passive is untouchable, full stop.",
                ],
              ].map(([code, body], i) => (
                <li
                  key={code}
                  className="flex gap-4 rounded-lg border border-border bg-surface p-4"
                >
                  <span className="font-mono text-sm tabular-nums text-accent">
                    {String(i + 1)}
                  </span>
                  <div>
                    <p className="font-mono text-sm text-foreground">{code}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section kicker="05 · the rejects" title="Reverting is a feature">
            <p>
              Every reject is public and indexed — the hook refusing a trade is
              the venue doing its job. Three paths, all demonstrated live in the{" "}
              <Link
                href="/console"
                className="text-accent-strong underline-offset-4 hover:underline"
              >
                console
              </Link>
              :
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {Object.values(REJECT_REASONS).map((r) => (
                <li
                  key={r.code}
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <Ban className="size-4 text-danger" aria-hidden />
                  <p className="mt-3 font-mono text-sm text-foreground">
                    {r.title}
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] leading-5 text-muted">
                    {r.detail}
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          <Section kicker="06 · what a slot is not" title="Honesty by design">
            <p>
              A slot is not LP equity, not a yield claim, and not a take-permit
              against a named maker. Explicitly not TAP, not Dockyard, not
              Parity. Unused slots expire worthless; active depth is capped at{" "}
              <span className="font-mono text-foreground">λ × total</span>. No
              fake APY. No finalist guarantee.
            </p>
            <Link
              href="/console"
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-md bg-accent px-6 font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px"
            >
              See it run
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
