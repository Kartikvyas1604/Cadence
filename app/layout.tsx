import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { EpochTicker } from "@/components/epoch-ticker";
import { CadenceProvider } from "@/lib/cadence/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cadence-eg.vercel.app"),
  title: "Cadence — Scarce epoch execution capacity",
  description:
    "Buy a cadence slot for this epoch. Swap against active reserves only. No slot, no fill. ERC-1155 capacity tickets on a Uniswap v4 hook.",
  openGraph: {
    type: "website",
    siteName: "Cadence",
    title: "Cadence — Buy a slot, fill against active depth",
    description:
      "Buy a cadence slot for this epoch. Swap against active reserves only. No slot, no fill.",
    url: "https://cadence-eg.vercel.app",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Cadence — scarce epoch execution capacity" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cadence — Buy a cadence slot for this epoch",
    description: "No slot, no fill. ERC-1155 capacity tickets on a Uniswap v4 hook.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: "/" },
  other: {
    "script:ld+json": JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Cadence",
      description: "Scarce per-epoch execution capacity as ERC-1155 cadence slots on a Uniswap v4 hook.",
      applicationCategory: "FinanceApplication",
    }),
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full motion-safe:scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <CadenceProvider>
          <SiteHeader />
          <EpochTicker />
          {children}
        </CadenceProvider>
      </body>
    </html>
  );
}
