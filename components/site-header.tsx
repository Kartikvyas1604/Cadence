"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { CadenceLogo } from "./logo";
import { WalletButton } from "./wallet-button";
import { NetworkSwitcher } from "./network-switcher";

/** Primary routes stay one-tap reachable on small screens (Beat #1 path). */
const NAV_PRIMARY = [
  { href: "/console", label: "Console" },
  { href: "/buy", label: "Buy" },
  { href: "/swap", label: "Swap" },
  { href: "/lp", label: "LP" },
] as const;

/** Secondary routes collapse into the menu below `md` (uiux-6). */
const NAV_SECONDARY = [
  { href: "/clob", label: "CLOB" },
  { href: "/router", label: "Router" },
  { href: "/privacy", label: "Privacy" },
  { href: "/graph", label: "Graph" },
  { href: "/intel", label: "Intel" },
  { href: "/admin", label: "Admin" },
] as const;

const NAV = [...NAV_PRIMARY, ...NAV_SECONDARY] as const;

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-10 shrink-0 items-center rounded-md px-3 text-sm transition-colors duration-100 ${
        active
          ? "bg-accent/10 text-accent-strong"
          : "text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
        <Link href="/" className="rounded-sm" aria-label="Cadence home">
          <CadenceLogo />
        </Link>

        {/* full nav above md */}
        <nav aria-label="Main" className="hidden min-w-0 overflow-x-auto md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} active={pathname === item.href} />
              </li>
            ))}
          </ul>
        </nav>

        {/* collapsed nav below md: primary routes one-tap, secondary in a menu */}
        <nav aria-label="Main" className="min-w-0 md:hidden">
          <ul className="flex items-center gap-1">
            {NAV_PRIMARY.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} active={pathname === item.href} />
              </li>
            ))}
            <li className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="More pages"
                className="inline-flex h-10 items-center rounded-md px-2.5 text-sm text-muted transition-colors duration-100 hover:bg-surface-raised hover:text-foreground"
              >
                {menuOpen ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
              </button>
              {menuOpen ? (
                <ul
                  role="menu"
                  className="absolute right-0 top-12 z-50 w-44 rounded-md border border-border bg-surface p-1 shadow-lg"
                >
                  {NAV_SECONDARY.map((item) => (
                    <li key={item.href} role="none">
                      <Link
                        role="menuitem"
                        href={item.href}
                        aria-current={pathname === item.href ? "page" : undefined}
                        onClick={() => setMenuOpen(false)}
                        className={`flex h-10 items-center rounded-sm px-3 text-sm transition-colors duration-100 ${
                          pathname === item.href
                            ? "bg-accent/10 text-accent-strong"
                            : "text-muted hover:bg-surface-raised hover:text-foreground"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <NetworkSwitcher />
          <WalletButton />
          <Link
            href="/buy"
            className="inline-flex h-10 items-center whitespace-nowrap rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors duration-100 hover:bg-accent-strong active:translate-y-px"
          >
            <span className="hidden sm:inline">Buy a slot</span>
            <span className="sm:hidden">Buy</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
