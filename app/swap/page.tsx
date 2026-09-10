import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SiteFooter } from "@/components/site-footer";
import { SwapView } from "@/components/swap-view";

export const metadata: Metadata = {
  ...pageMetadata("/swap", "Swap — Cadence", "beforeSwap checks slot ≥ size, burns the notional, fills against active reserves only. No slot, no fill."),
};

export default function SwapPage() {
  return (
    <>
      <SwapView />
      <SiteFooter />
    </>
  );
}
