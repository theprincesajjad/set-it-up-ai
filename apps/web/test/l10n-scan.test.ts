// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no types
import { scan, scanSource } from "../../../scripts/l10n-scan.mjs";

type Hit = { file: string; line: number; why: string; text: string };
const hits = (src: string, file = "apps/web/src/app/(pass)/x.tsx"): Hit[] => scanSource(file, src);

describe("l10n scanner (customer-facing code goes through t())", () => {
  it("finds no hard-coded English in customer-facing mobile and web code", () => {
    const found: Hit[] = scan();
    expect(found.map((h) => `${h.file}:${h.line} [${h.why}] ${h.text}`)).toEqual([]);
  }, 60_000);

  it("flags JSX text, UI attributes and sentences", () => {
    expect(hits(`export const A = () => <p>Your order is ready</p>;`)).toHaveLength(1);
    expect(hits(`export const A = () => <button aria-label="Close the sheet" />;`)).toHaveLength(1);
    expect(hits(`export const A = () => <p>{ok ? "Open now" : "Closed"}</p>;`).length).toBeGreaterThan(0);
    expect(hits(`const msg = "Thanks for joining our rewards";`)).toHaveLength(1);
  });

  it("accepts t(), brand names, numbers and the l10n-ok escape hatch", () => {
    expect(hits(`export const A = () => <p>{t(L, "ui.close")}</p>;`)).toEqual([]);
    expect(hits(`export const A = () => <p>Apple Wallet</p>;`)).toEqual([]);
    expect(hits(`export const A = () => <p>{n}</p>;`)).toEqual([]);
    expect(hits(`// l10n-ok: dev-only notice\nconst msg = "Thanks for joining our rewards";`)).toEqual([]);
  });

  it("flags English sentences built with a template string, but not message keys or CSS", () => {
    expect(hits("const label = `${a} of ${b} ${unit}. ${n} to go`;").length).toBeGreaterThan(0);
    expect(hits("const k = `rest.cat.status.${s}`;")).toEqual([]);
    expect(hits("const g = `repeat(${n}, minmax(0, 1fr))`;")).toEqual([]);
  });

  it("flags English-only display helpers, which have *L versions that take the language", () => {
    expect(hits(`import { formatPts } from "../lib/award";\nexport const x = formatPts(3);`).length).toBeGreaterThan(0);
    expect(hits(`// l10n-ok: English branch\nimport { formatPts } from "../lib/award";`)).toEqual([]);
    expect(hits(`import { formatPtsL } from "../lib/formatL";`)).toEqual([]);
  });

  it("flags imports of the English-only copy library", () => {
    expect(hits(`import { copy } from "@ll/shared/copy/en-CA";\nexport const x = copy.home.title;`).length).toBeGreaterThan(0);
  });
});
