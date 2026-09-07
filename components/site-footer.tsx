export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between md:px-6 lg:px-8">
        <div className="max-w-md space-y-2">
          <p className="font-serif text-xl text-foreground">Apron</p>
          <p className="text-sm leading-6 text-muted">
            Scarce per-epoch execution capacity as ERC-1155 apron slots on a
            Uniswap v4 hook. Unused apron slots expire worthless. A slot is
            capacity, not LP equity. No APY is offered or implied.
          </p>
        </div>
        <div className="space-y-2 font-mono text-xs leading-5 text-muted">
          <p className="uppercase tracking-widest text-foreground/80">
            Explicitly not
          </p>
          <p>
            ≠ TAP (no Aqua take-permit) · ≠ Dockyard (no fee desk) · ≠ Parity
            (no peg desk)
          </p>
          <p>No secondary CLOB in MVP · No fake APY · No finalist guarantee</p>
        </div>
      </div>
    </footer>
  );
}
