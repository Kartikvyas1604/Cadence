import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SiteFooter } from "@/components/site-footer";
import { IntelView } from "@/components/intel-view";

export const metadata: Metadata = {
  ...pageMetadata("/intel", "Intel — Cadence", "One paid Hedera x402 call returns a capacity/toxicity quote that writes the cadence-slot ask."),
};

export default function IntelPage() {
  return (
    <>
      <IntelView />
      <SiteFooter />
    </>
  );
}
