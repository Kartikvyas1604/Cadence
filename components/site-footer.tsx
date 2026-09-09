import { CadenceLogo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between md:px-6 lg:px-8">
        <div className="max-w-md space-y-2">
          <CadenceLogo compact />
          <p className="text-sm leading-6 text-muted">
            Scarce per-epoch execution capacity as ERC-1155 cadence slots on a
            Uniswap v4 hook. Unused cadence slots expire worthless. A slot is
            capacity, not LP equity. No APY is offered or implied.
          </p>
        </div>
        <p className="text-sm leading-6 text-muted">
          © {new Date().getFullYear()} Cadence. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
