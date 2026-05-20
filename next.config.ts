import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Old Wix URLs → new clean slugs.
      { source: "/about-1", destination: "/about", permanent: true },
      { source: "/s-projects-basic", destination: "/projects", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "static.wixstatic.com" },
    ],
  },
};

export default nextConfig;
