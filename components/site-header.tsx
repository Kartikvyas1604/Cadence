"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { CadenceLogo, CadenceMark } from "./logo";
import { WalletButton } from "./wallet-button";
import { NetworkSwitcher } from "./network-switcher";

/**
 * Priority-collapse navigation (uiux-6, hardened):
 *  - ≥ xl (1280px): all routes inline — no horizontal scrolling ever
 *  - ≥ lg (1024px): primary routes inline, secondary in the disclosure menu
 *  - <  lg:         everything in the disclosure menu (primary listed first)
 * The nav NEVER scrolls horizontally: there is no overflow-x-auto anywhere,
 * and inline items only render at widths where they arithmetically fit.
 */

const NAV_PRIMARY = [
  { href: "/console", label: "Console" },
  { href: "/buy", label: "Buy" },
  { href: "/swap", label: "Swap" },
  { href: "/lp", label: "LP" },
] as const;

const NAV_SECONDARY = [
  { href: "/clob", label: "CLOB" },
  { href: "/router", label: "Router" },
  { href: "/privacy", label: "Privacy" },
  { href: "/graph", label: "Graph" },
  { href: "/intel", label: "Intel" },
  { href: "/admin", label: "Admin" },
] as const;

const NAV = [...NAV_PRIMARY, ...NAV_SECONDARY] as const;

const linkBase =
  "inline-flex h-9 shrink-0 items-center rounded-md px-2.5 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${linkBase} ${
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
  // menu state is bound to the route it was opened on — navigating (link,
  // back/forward) closes it automatically without a setState-in-effect
  const [menuState, setMenuState] = useState({ path: pathname, open: false });
  const menuOpen = menuState.open && menuState.path === pathname;
  const setMenuOpen = useCallback(
    (open: boolean) => setMenuState({ path: pathname, open }),
    [pathname],
  );

  // close the disclosure on Escape / outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.("[data-nav-menu], [data-nav-menu-button]")) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, setMenuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-2 px-4 md:px-6 lg:px-8">
        {/* logo: mark-only below sm — the wordmark is the overflow risk */}
        <Link
          href="/"
          className="shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="Cadence home"
        >
          <span className="sm:hidden">
            <CadenceMark size={28} />
          </span>
          <span className="hidden sm:flex">
            <CadenceLogo />
          </span>
        </Link>

        {/* ≥ xl: all ten routes inline */}
        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex items-center gap-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} label={item.label} active={pathname === item.href} />
              </li>
            ))}
          </ul>
        </nav>

        {/* lg–xl: primary inline, secondary in the disclosure */}
        <nav aria-label="Main" className="hidden min-w-0 items-center gap-0.5 lg:flex xl:hidden">
          {NAV_PRIMARY.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} active={pathname === item.href} />
          ))}
          <MenuButton open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} />
        </nav>

        {/* < lg: disclosure only — primary routes listed first inside */}
        <nav aria-label="Main" className="flex min-w-0 items-center lg:hidden">
          <MenuButton open={menuOpen} onToggle={() => setMenuOpen(!menuOpen)} />
        </nav>

        {/* cohesive control group: network · wallet · primary CTA */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <NetworkSwitcher />
          </div>
          <WalletButton />
          <Link
            href="/buy"
            aria-label="Buy a cadence slot"
            className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent-strong active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="hidden sm:inline">Buy a slot</span>
            <span className="sm:hidden">Buy</span>
          </Link>
        </div>
      </div>

      {/* disclosure menu — the single responsive overflow valve, full-width */}
      {menuOpen ? (
        <div
          data-nav-menu
          className="absolute inset-x-0 top-16 z-50 border-b border-border bg-surface shadow-2xl shadow-black/50"
        >
          <div className="mx-auto w-full max-w-7xl px-4 pb-4 pt-2 md:px-6 lg:px-8">
            <ul role="menu" className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {NAV.map((item) => (
                <li key={item.href} role="none">
                  <Link
                    role="menuitem"
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`flex h-10 items-center rounded-sm px-3 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
          </div>
        </div>
      ) : null}
    </header>
  );
}

function MenuButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-nav-menu-button
      onClick={onToggle}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-label={open ? "Close menu" : "More pages"}
      className={`inline-flex h-9 shrink-0 items-center justify-center rounded-md px-2.5 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        open
          ? "bg-surface-raised text-foreground"
          : "text-muted hover:bg-surface-raised hover:text-foreground"
      }`}
    >
      {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
    </button>
  );
}
