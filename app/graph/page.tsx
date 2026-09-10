import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SiteFooter } from "@/components/site-footer";
import { GraphExplorer } from "@/components/graph-explorer";

export const metadata: Metadata = {
  ...pageMetadata("/graph", "Graph — Cadence", "Live subgraph index of cadence-slot mint, burn, and consume events with per-epoch notional totals."),
};

export default function GraphPage() {
  return (
    <>
      <GraphExplorer />
      <SiteFooter />
    </>
  );
}
