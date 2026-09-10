import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { ConsoleView } from "@/components/console-view";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  ...pageMetadata("/console", "Console — Cadence", "Buy a cadence slot, swap against active depth, watch the hook reject everyone else. Live demo console."),
};

export default function ConsolePage() {
  return (
    <>
      <ConsoleView />
      <SiteFooter />
    </>
  );
}
