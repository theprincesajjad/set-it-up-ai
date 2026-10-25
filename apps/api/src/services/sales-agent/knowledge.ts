/**
 * What the assistant may quote besides the live tools: the FAQ (docs/sales/agent-faq.md) and the text of the legal pages
 * (docs/legal/*.md), read from the same files the website renders, with the same {{tokens}} filled from plans.ts, so a
 * figure here cannot differ from the product or from the page the owner can open.
 *
 * Search is plain keyword scoring over `##` sections: no embeddings, nothing to keep in sync. The model writes the
 * query in English (the files are English) whatever language the owner used.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fillLegalTokens } from "@ll/shared";

export type KnowledgeSource = "faq" | "terms" | "privacy" | "merchant_agreement" | "rewards";
export interface Passage {
  source: KnowledgeSource;
  title: string;
  text: string;
  /** Legal pages are drafts until a lawyer signs off; the assistant says so. */
  draft: boolean;
}

const FILES: { source: KnowledgeSource; rel: string; label: string }[] = [
  { source: "faq", rel: "sales/agent-faq.md", label: "FAQ" },
  { source: "terms", rel: "legal/terms-of-service.md", label: "Terms of Service" },
  { source: "privacy", rel: "legal/privacy-policy.md", label: "Privacy Policy" },
  { source: "merchant_agreement", rel: "legal/merchant-agreement.md", label: "Merchant Agreement" },
  { source: "rewards", rel: "legal/rewards-terms.md", label: "Rewards Terms" },
];
export const SOURCE_LABEL: Record<KnowledgeSource, string> = Object.fromEntries(FILES.map((f) => [f.source, f.label])) as Record<KnowledgeSource, string>;

const here = path.dirname(fileURLToPath(import.meta.url));

/** Where docs/ lives: next to the repo (dev, tests, the standard deployment), or DOCS_DIR when the API ships without it. */
export function findDocsDir(): string | null {
  const candidates = [process.env.DOCS_DIR, path.join(process.cwd(), "../../docs"), path.join(process.cwd(), "docs"), path.resolve(here, "../../../../../docs")].filter((c): c is string => !!c);
  for (const c of candidates) if (existsSync(path.join(c, "sales/agent-faq.md"))) return c;
  return null;
}

const MAX_PASSAGE = 1400;

export function parseSections(md: string, source: KnowledgeSource, draft: boolean): Passage[] {
  const out: Passage[] = [];
  let title = "";
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join("\n").trim();
    if (title && body) {
      // Long sections are split on paragraph breaks so a hit returns the relevant part, not a whole page.
      const paras = body.split(/\n{2,}/);
      let cur = "";
      for (const p of paras) {
        if (cur && cur.length + p.length > MAX_PASSAGE) {
          out.push({ source, title, text: cur.trim(), draft });
          cur = "";
        }
        cur += (cur ? "\n\n" : "") + p;
      }
      if (cur.trim()) out.push({ source, title, text: cur.trim().slice(0, MAX_PASSAGE * 2), draft });
    }
    lines = [];
  };
  for (const line of md.split("\n")) {
    const h = /^#{2,3}\s+(.+)$/.exec(line);
    if (h) {
      flush();
      title = h[1]!.trim();
    } else lines.push(line);
  }
  flush();
  return out;
}

let cache: { dir: string; stamp: string; passages: Passage[] } | null = null;

export function loadKnowledge(): Passage[] {
  const dir = findDocsDir();
  if (!dir) return [];
  const stamp = FILES.map((f) => {
    try {
      return statSync(path.join(dir, f.rel)).mtimeMs;
    } catch {
      return 0;
    }
  }).join(",");
  if (cache && cache.dir === dir && cache.stamp === stamp) return cache.passages;
  const passages: Passage[] = [];
  for (const f of FILES) {
    const file = path.join(dir, f.rel);
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    const md = fillLegalTokens(raw).replace(/^# DRAFT[^\n]*\n+(> [^\n]*\n)*/i, "");
    passages.push(...parseSections(md, f.source, f.source !== "faq"));
  }
  cache = { dir, stamp, passages };
  return passages;
}

const STOP = new Set("a an the is are was were be do does did can could should would will of to in on for and or but if it its my our your we you i me us how what when where which who why with at by from as this that there any about than then so not no yes".split(" "));
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, "") : t));

export function searchKnowledge(query: string, sources: KnowledgeSource[] | null, limit = 4): Passage[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const scored = loadKnowledge()
    .filter((p) => !sources || sources.includes(p.source))
    .map((p) => {
      const titleT = new Set(tokens(p.title));
      const bodyT = tokens(p.text);
      let score = 0;
      for (const t of q) {
        if (titleT.has(t)) score += 3;
        const n = bodyT.filter((b) => b === t).length;
        if (n) score += 1 + Math.min(n, 3) * 0.3;
      }
      // The FAQ is written as the owner's question, so it wins ties against the legal text.
      if (p.source === "faq") score *= 1.25;
      return { p, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.p);
}

/** Tests: forget what was read. */
export function resetKnowledgeCache(): void {
  cache = null;
}
