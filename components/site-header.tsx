"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CadenceLogo } from "./logo";
import { WalletButton } from "./wallet-button";
import { NetworkSwitcher } from "./network-switcher";

const NAV = [
  { href: "/console", label: "Console" },
  { href: "/buy", label: "Buy" },
  { href: "/swap", label: "Swap" },
  { href: "/lp", label: "LP" },
  { href: "/clob", label: "CLOB" },
  { href: "/router", label: "Router" },
  { href: "/privacy", label: "Privacy" },
  { href: "/graph", label: "Graph" },
  { href: "/intel", label: "Intel" },
  { href: "/admin", label: "Admin" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
        <Link href="/" className="rounded-sm" aria-label="Cadence home">
          <CadenceLogo />
        </Link>

        <nav aria-label="Main" className="min-w-0 overflow-x-auto">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex h-10 shrink-0 items-center rounded-md px-3 text-sm transition-colors duration-100 ${
                      active
                        ? "bg-accent/10 text-accent-strong"
                        : "text-muted hover:bg-surface-raised hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <NetworkSwitcher />
          <WalletButton />
          <Link
            href="/buy"
            className="inline-flex h-10 items-center whitespace-nowrap rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px"
          >
            Buy a slot
          </Link>
        </div>
      </div>
    </header>
  );
}
