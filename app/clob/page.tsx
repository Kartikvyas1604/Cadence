import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SiteFooter } from "@/components/site-footer";
import { ClobView } from "@/components/clob/clob-view-live";

export const metadata: Metadata = {
  ...pageMetadata("/clob", "Slot CLOB — Cadence", "Trade cadence slots on the secondary order book — limit buys and sells of ERC-1155 epoch capacity, expiring at refresh."),
};

export default function ClobPage() {
  return (
    <>
      <ClobView />
      <SiteFooter />
    </>
  );
}
