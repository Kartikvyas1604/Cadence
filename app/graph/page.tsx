import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { GraphExplorer } from "@/components/graph-explorer";

export const metadata: Metadata = {
  title: "Graph — Cadence",
  description:
    "Live subgraph index of cadence-slot mint, burn, and consume events with per-epoch notional totals.",
};

export default function GraphPage() {
  return (
    <>
      <GraphExplorer />
      <SiteFooter />
    </>
  );
}
