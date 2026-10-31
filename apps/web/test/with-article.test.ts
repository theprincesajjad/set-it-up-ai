import { describe, expect, it } from "vitest";
import { withArticle } from "@/lib/format";
import { stampsToGoT } from "@/lib/joinCopy";

describe("withArticle (\"6 more for …\")", () => {
  it("adds a or an before a plain reward name", () => {
    expect(withArticle("free drink")).toBe("a free drink");
    expect(withArticle("extra shot")).toBe("an extra shot");
  });
  it("leaves prices, numbers and names that already have an article alone", () => {
    expect(withArticle("$10 off your next visit")).toBe("$10 off your next visit");
    expect(withArticle("20% off")).toBe("20% off");
    expect(withArticle("2 free cookies")).toBe("2 free cookies");
    expect(withArticle("a free coffee")).toBe("a free coffee");
  });
  it("reads right in the join success line", () => {
    const t = ((k: string) => k) as never;
    expect(stampsToGoT(t, "en", 6, "$10 off your next visit")).toBe("6 more for $10 off your next visit");
    expect(stampsToGoT(t, "en", 4, "Free drink")).toBe("4 more for a free drink");
  });
});
