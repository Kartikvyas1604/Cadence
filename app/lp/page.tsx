import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { LpView } from "@/components/lp-view";

export const metadata: Metadata = {
  title: "LP desk — Cadence",
  description:
    "Deposit liquidity, sell this epoch's cadence-slot capacity, earn revenue separate from swap fees.",
};

export default function LpPage() {
  return (
    <>
      <LpView />
      <SiteFooter />
    </>
  );
}
