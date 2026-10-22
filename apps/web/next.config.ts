import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@ll/shared", "@ll/design-tokens"],
  poweredByHeader: false,
  turbopack: {
    rules: {
      // Workspace TS sources import "./x.js" (NodeNext style); Turbopack has no extensionAlias.
      "*.ts": {
        condition: { path: /packages\/(shared|design-tokens)\/src\// },
        loaders: [path.resolve(process.cwd(), "loaders/ts-js-extension.cjs")],
      },
    },
  },
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    return [
      // Spec aliases (docs/design/screens/*) → canonical routes.
      { source: "/shoppers", destination: "/for-shoppers", permanent: true },
      { source: "/bia", destination: "/for-bias", permanent: true },
      { source: "/s/:slug", destination: "/shops/:slug", permanent: false },
      { source: "/card", destination: "/me", permanent: false },
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/rewards-terms", destination: "/legal/rewards", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // Token links (quotes, invoices) and signed-in pages must never be indexed or cached by proxies.
        source: "/:prefix(q|i|o|me)/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
