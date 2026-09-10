import type { Metadata } from "next";

/**
 * Per-route metadata (seo-1 + seo-2): every route declares its OWN canonical
 * and OG/Twitter title+description+url — deep links unfurl as the page they
 * are, never as the homepage pitch. Next replaces the parent openGraph /
 * twitter blocks when a page exports them, so each route carries the full
 * set (card, siteName, images, url) — nothing inherited is silently dropped.
 */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  return {
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Cadence",
      title,
      description,
      url: `https://cadence-eg.vercel.app${path === "/" ? "" : path}`,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/opengraph-image"],
    },
  };
}
