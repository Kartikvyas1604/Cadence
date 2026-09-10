import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://cadence-eg.vercel.app";
  return ["", "/buy", "/swap", "/lp", "/clob", "/router", "/privacy", "/graph", "/intel", "/console", "/protocol"].map(
    (path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
    }),
  );
}
