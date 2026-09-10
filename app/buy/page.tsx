import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SiteFooter } from "@/components/site-footer";
import { BuyView } from "@/components/buy-view";

export const metadata: Metadata = {
  ...pageMetadata("/buy", "Buy a cadence slot — Cadence", "Fixed-price ERC-1155 mint for the current epoch — capacity comes from the LP active budget."),
};

export default function BuyPage() {
  return (
    <>
      <BuyView />
      <SiteFooter />
    </>
  );
}
