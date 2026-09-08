import Link from "next/link";
import { ArrowRight, LineChart, RadioTower, ShieldBan, Terminal, Wallet } from "lucide-react";

const PAGES = [
  {
    href: "/lp",
    icon: Wallet,
    title: "LP desk",
    body: "Deposit liquidity, sell this epoch's capacity, earn slot revenue — bounded withdrawals.",
  },
  {
    href: "/console",
    icon: Terminal,
    title: "Console",
    body: "Buy a slot, swap, and watch the hook revert without one — live on a fork.",
  },
  {
    href: "/protocol",
    icon: ShieldBan,
    title: "Protocol",
    body: "Active/passive reserves, the λ split, epoch refresh, and the beforeSwap gate.",
  },
  {
    href: "/graph",
    icon: LineChart,
    title: "Graph",
    body: "Mint, burn, consume — the index that proves the capacity economy is real.",
  },
  {
    href: "/intel",
    icon: RadioTower,
    title: "Intel",
    body: "One paid x402 call on Hedera writes the cadence-slot ask. Pay per quote.",
  },
] as const;

export function HomeLinks() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-20 lg:px-8">
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-serif text-3xl tracking-tight text-foreground md:text-4xl">
          Five rooms, one venue
        </h2>
        <Link
          href="/console"
          className="hidden shrink-0 items-center gap-1.5 font-mono text-sm text-accent-strong transition-colors duration-100 hover:text-foreground sm:inline-flex"
        >
          skip to the console <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <ul className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {PAGES.map((p) => (
          <li key={p.href} className="bg-surface">
            <Link
              href={p.href}
              className="group flex h-full flex-col p-6 transition-colors duration-100 hover:bg-surface-raised"
            >
              <p.icon
                className="size-5 text-accent"
                aria-hidden
              />
              <p className="mt-4 font-serif text-xl text-foreground">
                {p.title}
              </p>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted">
                {p.body}
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-accent-strong opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                open <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
