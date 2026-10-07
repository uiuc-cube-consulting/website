import type { MetadataRoute } from "next";

const siteUrl = "https://www.cubeconsulting.org";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteUrl}/` },
    { url: `${siteUrl}/projects` },
    { url: `${siteUrl}/services` },
    { url: `${siteUrl}/about` },
    { url: `${siteUrl}/join-us` },
    { url: `${siteUrl}/contact` },
    // Add /apply based on recruiting.
  ];
}