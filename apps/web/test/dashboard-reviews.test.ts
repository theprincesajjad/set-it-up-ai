import { describe, expect, it } from "vitest";
import { firstName, looksLikeLink } from "@/lib/dashboard/reviews";

describe("review request helpers", () => {
  it("takes the first word of a name and falls back when there is none", () => {
    expect(firstName("Ayesha Rao", "your client")).toBe("Ayesha");
    expect(firstName("  Priya ", "your client")).toBe("Priya");
    expect(firstName(null, "your client")).toBe("your client");
    expect(firstName("", "your client")).toBe("your client");
  });
  it("accepts an https link or nothing, and nothing else", () => {
    expect(looksLikeLink("")).toBe(true);
    expect(looksLikeLink("https://g.page/r/abc/review")).toBe(true);
    expect(looksLikeLink("http://g.page/r/abc/review")).toBe(false);
    expect(looksLikeLink("g.page/r/abc")).toBe(false);
    expect(looksLikeLink("https://")).toBe(false);
  });
});
