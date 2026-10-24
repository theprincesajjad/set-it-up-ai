import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FEES, PLANS, legalTokens } from "@ll/shared";

/**
 * Free shops pay no subscription and no fee on loyalty, but online orders on Free carry a platform fee (FEES.orderBpsFree).
 * So "no transaction fees" and its cousins are not true and must not appear in anything a person reads. This scans
 * the web and mobile source, the shared package (plan blurbs, messages), and the legal pages.
 */
const ROOT = path.resolve(__dirname, "../../..");
const SCAN = ["apps/web/src", "apps/mobile/src", "packages/shared/src", "docs/legal"];
/** docs/legal also holds internal notes (the compliance checklist quotes the bad phrase to forbid it); only the four published pages count. */
const PUBLISHED_LEGAL = new Set(["terms-of-service.md", "privacy-policy.md", "rewards-terms.md", "merchant-agreement.md"]);
const SKIP = new Set(["node_modules", ".next", "dist-web", "dist", "test", "__tests__", "e2e", "screenshots"]);
const EXT = /\.(ts|tsx|md|json|html)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".next")) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/** "no transaction fee(s)" is only allowed when it is explicitly about loyalty ("no transaction fee on your loyalty program"). */
const CLAIMS: [string, RegExp][] = [
  ["no transaction fee(s)", /no transaction fees?(?! on (your )?loyalty)/i],
  ["zero transaction fees", /zero transaction fees?/i],
  ["no fees", /\bno fees\b/i],
  ["0% fees", /\b0% fees\b/i],
  ["fee-free", /\bfee-free\b/i],
  ["without any fees", /without (any )?fees\b/i],
];

describe("no 'no transaction fees' claims in user-facing copy", () => {
  const files = SCAN.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !f.includes(`${path.sep}docs${path.sep}legal${path.sep}`) || PUBLISHED_LEGAL.has(path.basename(f)));
  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(150);
  });
  for (const [label, re] of CLAIMS) {
    it(`never says "${label}"`, () => {
      const hits = files.flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ f: path.relative(ROOT, f), line: i + 1, text: line.trim().slice(0, 140), ok: !re.test(line) }))
          .filter((x) => !x.ok),
      );
      expect(hits, `remove or reword: ${JSON.stringify(hits, null, 1)}`).toEqual([]);
    });
  }
});

describe("what the Free plan says matches what Free pays", () => {
  const pct = `${Number((FEES.orderBpsFree / 100).toFixed(2))}%`;
  it("the Free blurb states the order fee and does not claim zero fees", () => {
    expect(FEES.orderBpsFree).toBeGreaterThan(0);
    expect(PLANS.free.blurb).toContain(pct);
    expect(PLANS.free.blurb.toLowerCase()).toContain("no fee on loyalty");
    expect(PLANS.free.blurb.toLowerCase()).not.toContain("no transaction fees");
  });
  it("the legal plans table carries the same blurb", () => {
    expect(legalTokens()["table.plans"]).toContain(PLANS.free.blurb);
  });
});
