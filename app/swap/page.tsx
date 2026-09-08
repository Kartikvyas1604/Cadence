import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SwapView } from "@/components/swap-view";

export const metadata: Metadata = {
  title: "Swap — Cadence",
  description:
    "beforeSwap checks slot ≥ size, burns the notional, fills against active reserves only. No slot, no fill.",
};

export default function SwapPage() {
  return (
    <>
      <SwapView />
      <SiteFooter />
    </>
  );
}
