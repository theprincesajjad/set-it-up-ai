import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalDocView } from "@/components/site/LegalDocView";

describe("legal page shell", () => {
  it("English: the draft banner, the page label and a link to the French version", () => {
    render(<LegalDocView html="<h1>Privacy</h1>" isDraft lang="en" otherHref="/legal/privacy?lang=fr" />);
    expect(screen.getByRole("note").textContent).toContain("DRAFT: not reviewed by a lawyer and not in effect.");
    expect(screen.getByText("Legal · Draft")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Français" });
    expect(link.getAttribute("href")).toBe("/legal/privacy?lang=fr");
    expect(link.getAttribute("hreflang")).toBe("fr-CA");
  });
  it("French: the banner and labels are French, the article is marked fr-CA, and the translation status is not on the page", () => {
    const { container } = render(<LegalDocView html="<h1>Politique</h1>" isDraft lang="fr" otherHref="/legal/privacy" />);
    expect(screen.getByRole("note").textContent).toContain("BROUILLON : non révisé par un juriste et non en vigueur.");
    expect(screen.getByText("Juridique · Brouillon")).toBeTruthy();
    expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/legal/privacy");
    expect(container.querySelector("article")!.getAttribute("lang")).toBe("fr-CA");
    expect(container.textContent).not.toMatch(/Traduction|à faire réviser/);
  });
  it("a page with no other language has no switch, and a non-draft has no banner", () => {
    render(<LegalDocView html="<p>x</p>" isDraft={false} lang="en" />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
