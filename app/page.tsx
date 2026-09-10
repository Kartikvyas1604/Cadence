import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/hero";
import { HomeLinks } from "@/components/home-links";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata(
  "/",
  "Cadence — Scarce epoch execution capacity",
  "Buy a cadence slot for this epoch. Swap against active reserves only. No slot, no fill. ERC-1155 capacity tickets on a Uniswap v4 hook.",
);

export default function Home() {
  return (
    <>
      <div className="flex-1">
        <Hero />
        <HomeLinks />
      </div>
      <SiteFooter />
    </>
  );
}
