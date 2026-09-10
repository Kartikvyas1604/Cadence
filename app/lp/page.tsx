import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SiteFooter } from "@/components/site-footer";
import { LpView } from "@/components/lp-view";

export const metadata: Metadata = {
  ...pageMetadata("/lp", "LP desk — Cadence", "Deposit liquidity, sell this epoch's cadence-slot capacity, earn revenue separate from swap fees."),
};

export default function LpPage() {
  return (
    <>
      <LpView />
      <SiteFooter />
    </>
  );
}
