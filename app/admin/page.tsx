import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = {
  title: "Admin — Cadence",
  description:
    "Protocol treasury: the take-rate split on every cadence-slot sale, accrued on-chain and withdrawable by the treasury role.",
};

export default function AdminPage() {
  return (
    <>
      <AdminView />
      <SiteFooter />
    </>
  );
}
