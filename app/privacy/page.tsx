import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { PrivacyView } from "@/components/privacy/privacy-view";

export const metadata: Metadata = {
  title: "Privacy — Cadence",
  description:
    "Private Cadence Intent, stealth payer wallets, and the Aztec/Railgun fund path. The swap stays public.",
};

export default function PrivacyPage() {
  return (
    <>
      <PrivacyView />
      <SiteFooter />
    </>
  );
}
