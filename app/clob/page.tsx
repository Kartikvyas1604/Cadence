import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { ClobView } from "@/components/clob/clob-view-live";

export const metadata: Metadata = {
  title: "Slot CLOB — Cadence",
  description:
    "Trade cadence slots on the secondary order book — limit buys and sells of ERC-1155 epoch capacity, expiring at refresh.",
};

export default function ClobPage() {
  return (
    <>
      <ClobView />
      <SiteFooter />
    </>
  );
}
