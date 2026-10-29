"use client";
import { SiteBuilder } from "@/components/site-builder/SiteBuilder";
import { env } from "@/lib/env";

/** The built-in website builder (phase solo, workstream G). Docs: docs/engineering/site-builder.md. */
export default function SitePage() {
  return <SiteBuilder siteUrl={env.siteUrl} />;
}
