import type { Metadata } from "next";

/**
 * Per-route metadata (seo-1 + seo-2): every route declares its OWN canonical
 * and OG/Twitter title+description+url — deep links unfurl as the page they
 * are, never as the homepage pitch. og:url is omitted so metadataBase +
 * canonical resolve it per route.
 */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  return {
    alternates: { canonical: path },
    openGraph: { title, description },
    twitter: { title, description },
  };
}
