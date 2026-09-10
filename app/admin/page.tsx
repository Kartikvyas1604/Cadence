import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SiteFooter } from "@/components/site-footer";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = {
  ...pageMetadata("/admin", "Admin — Cadence", "Protocol treasury: the take-rate split on every cadence-slot sale, accrued on-chain and withdrawable by the treasury role."),
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <>
      <AdminView />
      <SiteFooter />
    </>
  );
}
