import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { BuyView } from "@/components/buy-view";

export const metadata: Metadata = {
  title: "Buy a cadence slot — Cadence",
  description:
    "Fixed-price ERC-1155 mint for the current epoch — capacity comes from the LP active budget.",
};

export default function BuyPage() {
  return (
    <>
      <BuyView />
      <SiteFooter />
    </>
  );
}
