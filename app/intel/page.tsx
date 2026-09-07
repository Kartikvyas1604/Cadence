import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { IntelView } from "@/components/intel-view";

export const metadata: Metadata = {
  title: "Intel — Apron",
  description:
    "One paid Hedera x402 call returns a capacity/toxicity quote that writes the apron-slot ask.",
};

export default function IntelPage() {
  return (
    <>
      <IntelView />
      <SiteFooter />
    </>
  );
}
