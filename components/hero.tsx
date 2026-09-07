import { ArrowDown } from "lucide-react";

const steps = [
  {
    n: "01",
    title: "Buy an apron slot",
    body: "Mint an ERC-1155 capacity ticket for the current epoch at a fixed primary price.",
  },
  {
    n: "02",
    title: "Swap against active depth",
    body: "Your fill executes against active reserves only. Passive stays locked until refresh.",
  },
  {
    n: "03",
    title: "No slot, no fill",
    body: "Without a slot — or oversize — the hook reverts before the swap touches the pool.",
  },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(240,180,65,0.09),transparent)]"
      />
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-20 md:px-6 md:pb-24 md:pt-28 lg:px-8">
        <p className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-accent">
          Uniswap v4 hook · ERC-1155 · one pair, one λ
        </p>
        <h1 className="max-w-3xl font-serif text-5xl leading-[1.05] tracking-tight text-foreground md:text-7xl">
          Buy an apron slot for <em className="italic text-accent-strong">this epoch.</em>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-muted md:text-lg md:leading-8">
          Apron tokenizes scarce per-epoch execution capacity. Solvers and size
          traders buy gate slots; the hook fills them against active reserves
          only. Everyone else reverts.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a
            href="#console"
            className="inline-flex h-12 items-center gap-2 rounded-md bg-accent px-6 font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px"
          >
            Open the console
            <ArrowDown className="size-4" aria-hidden />
          </a>
          <a
            href="#console"
            className="inline-flex h-12 items-center rounded-md border border-border-strong px-6 font-medium text-foreground transition-colors duration-100 hover:bg-surface-raised active:translate-y-px"
          >
            Watch a swap get rejected
          </a>
        </div>

        <ol className="mt-16 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="bg-surface p-6">
              <p className="font-mono text-xs text-accent">{s.n}</p>
              <p className="mt-3 font-serif text-xl text-foreground">{s.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
