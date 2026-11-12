import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/font is a build-time transform; the footer only needs the class name it returns.
vi.mock("next/font/local", () => ({ default: () => ({ variable: "font-var", className: "font-class", style: { fontFamily: "Halden" } }) }));

const { SiteFooter } = await import("@/components/site/SiteFooter");

/**
 * The Hindi, Urdu and Punjabi web fonts download only when a glyph of their script is drawn in the page's Noto stack (app/layout.tsx).
 * The footer names the three languages in their own scripts on every English page, so those names must be set in system fonts:
 * otherwise every visitor downloads about 385 kB of fonts for three words.
 */
describe("site footer language names", () => {
  const html = renderToStaticMarkup(<SiteFooter />);
  const NON_LATIN = /[ऀ-ॿ਀-੿؀-ۿ]/;

  it("sets every Devanagari, Gurmukhi and Arabic-script word in the device's own fonts", () => {
    // Text outside tags, piece by piece: a piece with one of these scripts must sit directly in a span that carries the system font.
    const pieces = [...html.matchAll(/<([a-z0-9]+)([^>]*)>([^<]+)/g)].filter((m) => NON_LATIN.test(m[3]!));
    expect(pieces.length).toBe(3);
    for (const [, tag, attrs] of pieces) {
      expect(tag).toBe("span");
      expect(attrs).toMatch(/font-family:\s*system-ui/);
      expect(attrs).toMatch(/lang="(hi|ur|pa)"/);
    }
  });

  it("is marked English and left to right, so the Urdu pages do not mirror its English lines", () => {
    expect(html).toMatch(/^<footer[^>]*\slang="en-CA"/);
    expect(html).toMatch(/^<footer[^>]*\sdir="ltr"/);
  });
});
