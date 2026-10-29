import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets parallel builds (e.g. two engineers' e2e servers) use separate output dirs: NEXT_DIST_DIR=.next-e2e.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@ll/shared", "@ll/design-tokens"],
  poweredByHeader: false,
  // The Docker image sets NEXT_OUTPUT=standalone: a self-contained server (.next/standalone) traced from the repo root, so
  // the runtime image needs no node_modules install. Unset everywhere else (dev, e2e, `next start`).
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const, outputFileTracingRoot: path.resolve(process.cwd(), "../..") } : {}),
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
      // OAuth / Stripe return URLs from the API (integrations.md, billing.md, payments.md) → the dashboard.
      { source: "/dashboard/integrations", has: [{ type: "query", key: "merchantId", value: "(?<mid>[0-9a-f-]+)" }], destination: "/m/:mid/integrations", permanent: false },
      { source: "/dashboard/billing", has: [{ type: "query", key: "merchant", value: "(?<mid>[0-9a-f-]+)" }], destination: "/m/:mid/billing", permanent: false },
      { source: "/dashboard/payments", has: [{ type: "query", key: "merchant", value: "(?<mid>[0-9a-f-]+)" }], destination: "/m/:mid/billing", permanent: false },
      { source: "/dashboard/:path*", destination: "/m", permanent: false },
      // phase-solo G: /s/:slug is now the shop's built-in website (app/(site)/s/[slug]); with no published site it still goes to /shops/:slug.
      { source: "/card", destination: "/me", permanent: false },
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/rewards-terms", destination: "/legal/rewards", permanent: true },
    ];
  },
  async rewrites() {
    return {
      // Before the filesystem: /for-nail-techs is a page of its own, so an afterFiles rewrite would never be tried.
      beforeFiles: [
        // TEMPORARY: ?v=<variant> (ids in LANDING_VARIANTS; any other value shows the page's control) previews a landing variant (app/(landing)/lp, prerendered, noindex) until the A/B assignment is built.
        { source: "/for-nail-techs", has: [{ type: "query", key: "trade", value: "(?<trade>brows|lashes|makeup)" }, { type: "query", key: "v", value: "(?<v>control|yours|privacy)" }], destination: "/lp/:trade/:v" },
        { source: "/for-nail-techs", has: [{ type: "query", key: "v", value: "(?<v>control|yours|privacy)" }], destination: "/lp/nails/:v" },
        { source: "/for-barbers", has: [{ type: "query", key: "v", value: "(?<v>control|yours|price)" }], destination: "/lp/barber/:v" },
        { source: "/for-groomers", has: [{ type: "query", key: "v", value: "(?<v>control|yours)" }], destination: "/lp/groom/:v" },
        // The nail page's other looks (?trade=brows|lashes|makeup) are prerendered at /for-nail-techs/[trade]; the public URL keeps the query.
        { source: "/for-nail-techs", has: [{ type: "query", key: "trade", value: "(?<trade>brows|lashes|makeup)" }], destination: "/for-nail-techs/:trade" },
      ],
      afterFiles: [
        // French (fr-CA) legal pages for Law 25: /legal/privacy?lang=fr is served by the static /legal/fr/privacy page (src/lib/legal.ts).
        { source: "/legal/:doc(privacy|rewards)", has: [{ type: "query", key: "lang", value: "fr" }], destination: "/legal/fr/:doc" },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        // Baseline hardening on every page and asset. Listed first so the narrower rules below can override a value.
        // HSTS is ignored over plain http (local dev) and honoured behind TLS. No CSP yet: it needs a nonce pass over the inline scripts.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=15552000" }] : []),
        ],
      },
      {
        // Token links (quotes, invoices) and signed-in pages must never be indexed or cached by proxies.
        source: "/:prefix(q|i|e|o|me|m|rep|admin|bia|dev)/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
