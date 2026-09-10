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
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Cadence — scarce epoch execution capacity" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/opengraph-image"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Cadence",
  description: "Scarce per-epoch execution capacity as ERC-1155 cadence slots on a Uniswap v4 hook.",
  applicationCategory: "FinanceApplication",
  url: "https://cadence-eg.vercel.app",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full motion-safe:scroll-smooth antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-foreground"
        >
          Skip to content
        </a>
        <CadenceProvider>
          <SiteHeader />
          <EpochTicker />
          <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
            {children}
          </main>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        </CadenceProvider>
      </body>
    </html>
  );
}
