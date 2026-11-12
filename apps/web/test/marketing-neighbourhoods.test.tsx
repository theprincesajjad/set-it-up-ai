import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const neighbourhoods = vi.fn();
vi.mock("@/lib/api/server", () => ({ publicServerApi: () => ({ network: { neighbourhoods } }) }));
vi.mock("@/lib/fonts/inter", () => ({ preloadInter: () => undefined }));

const page = async () => renderToStaticMarkup(await (await import("@/app/(marketing)/neighbourhoods/page")).default());

// A block body: a function returned from beforeEach is run as the test's cleanup, and mockReset() returns the mock itself.
beforeEach(() => {
  neighbourhoods.mockReset();
});

describe("/neighbourhoods", () => {
  it("says the list could not load, with a way to retry and a way out, instead of an empty list", async () => {
    neighbourhoods.mockImplementation(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:4000");
    });
    const html = await page();
    expect(html).toContain("We couldn’t load the neighbourhoods");
    expect(html).toContain("Nothing is lost");
    expect(html).toMatch(/href="\/neighbourhoods"[^>]*>(<[^>]+>)*Try again/);
    expect(html).toMatch(/href="\/"[^>]*>(<[^>]+>)*Back to home/);
    // One h1 (the page's own); the failure is a section of it. Nothing of the error itself is shown, and no empty state that looks real.
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("One neighbourhood at a time.");
    expect(html).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
    expect(html).not.toMatch(/<ul/);
  });
  it("says so when no street is live yet, in sentence case with a curly apostrophe", async () => {
    neighbourhoods.mockResolvedValue({ items: [] });
    const html = await page();
    // Said once: the empty state stands in for the "suggest your street" band under a list.
    expect(html.match(/We’re not on your street yet/g)).toHaveLength(1);
    expect(html).toContain("Suggest my street");
    expect(html).not.toContain("We couldn’t load");
  });
});
