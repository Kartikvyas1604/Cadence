import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { RouterView } from "@/components/router/router-view-live";

export const metadata: Metadata = {
  title: "Router — Cadence",
  description:
    "Quote registered cadence pools on remaining capacity and slot price, then execute the best route.",
};

export default function RouterPage() {
  return (
    <>
      <RouterView />
      <SiteFooter />
    </>
  );
}
