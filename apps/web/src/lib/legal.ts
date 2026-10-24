/**
 * Legal pages are rendered at build time from the drafts in docs/legal/*.md
 * (the source of truth, owned by legal). Static, so docs/ isn't needed at runtime.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { BRAND, fillLegalTokens } from "@ll/shared";

export const LEGAL_DOCS = {
  terms: { file: "terms-of-service.md", title: "Terms of Service" },
  privacy: { file: "privacy-policy.md", title: "Privacy Policy" },
  rewards: { file: "rewards-terms.md", title: "Rewards Terms" },
  merchants: { file: "merchant-agreement.md", title: "Merchant Agreement" },
} as const;

export type LegalSlug = keyof typeof LEGAL_DOCS;

async function findDocsDir(): Promise<string> {
  // `next build` / `next dev` run in apps/web; tests may run from the repo root.
  const candidates = [path.join(/*turbopackIgnore: true*/ process.cwd(), "../../docs/legal"), path.join(/*turbopackIgnore: true*/ process.cwd(), "docs/legal")];
  for (const c of candidates) {
    try {
      await readFile(path.join(/*turbopackIgnore: true*/ c, LEGAL_DOCS.terms.file));
      return c;
    } catch {
      /* try next */
    }
  }
  return candidates[0]!;
}

/** Markdown -> HTML for a legal doc: fills the {{tokens}} from plans.ts, drops the draft heading, applies the brand name. */
export function renderLegalMarkdown(source: string): { md: string; isDraft: boolean } {
  let md = fillLegalTokens(source);
  const isDraft = /DRAFT/i.test(md.slice(0, 400));
  // Drop the leading "# DRAFT ..." heading and its blockquote: the page shows its own DRAFT banner.
  md = md.replace(/^# DRAFT[^\n]*\n+(> [^\n]*\n)*/i, "");
  return { md: md.replaceAll("Local Loyalty", BRAND.name), isDraft };
}

export async function loadLegalDoc(slug: LegalSlug): Promise<{ title: string; html: string; isDraft: boolean }> {
  const meta = LEGAL_DOCS[slug];
  // Read at build time only (pages are SSG); keep docs/ out of the server trace.
  const { md, isDraft } = renderLegalMarkdown(await readFile(path.join(/*turbopackIgnore: true*/ await findDocsDir(), meta.file), "utf8"));
  const html = await marked.parse(md, { gfm: true });
  return { title: meta.title, html, isDraft };
}
