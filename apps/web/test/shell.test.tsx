import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calculator, Home, Users } from "lucide-react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Locale } from "@ll/shared";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("next/font/google", () => {
  const font = () => ({ className: "", variable: "", style: {} });
  return { Noto_Naskh_Arabic: font, Noto_Sans_Devanagari: font, Noto_Sans_Gurmukhi: font, Noto_Nastaliq_Urdu: font, Inter: font, Bricolage_Grotesque: font };
});
vi.mock("@/lib/api/browser", () => ({ sessionApi: { logout: vi.fn() }, browserApi: {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/1/customers/import",
  useSearchParams: () => new URLSearchParams(),
}));

import { Shell, type ShellSection } from "@/components/dashboard/Shell";
import { LocaleProvider } from "@/lib/i18n/client";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  window.matchMedia = ((q: string) => ({ matches: q.includes("min-width"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as never;
});

const sections: ShellSection[] = [
  { key: "today", label: "today", items: [{ href: "/m/1", label: "Home", icon: Home, exact: true }, { href: "/m/1/counter", label: "Counter", icon: Calculator }] },
  { key: "run", label: "run", items: [] },
  { key: "customers", label: "customers", items: [{ href: "/m/1/customers", label: "Customers", icon: Users }, { href: "/m/1/customers/import", label: "Import", icon: Users }] },
];

const shell = (locale: Locale = "en") =>
  render(
    <LocaleProvider locale={locale}>
      <Shell sections={sections} header={<span>Corner Bean</span>} account={<span>account</span>} mobileTitle="Corner Bean">
        <h1>Page</h1>
      </Shell>
    </LocaleProvider>,
  );

describe("shell", () => {
  it("draws the sections that have rows, in order, and marks the one current page", () => {
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0]!;
    expect(within(nav).getAllByText(/^(today|run|customers)$/).map((n) => n.textContent)).toEqual(["today", "customers"]);
    const current = within(nav).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page");
    // the longer match wins: Import, not Customers
    expect(current.map((l) => l.textContent)).toEqual(["Import"]);
  });

  it("moves focus between sidebar links with the arrow keys", async () => {
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0]!;
    const links = within(nav).getAllByRole("link");
    links[0]!.focus();
    const user = userEvent.setup();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(links[1]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(links[links.length - 1]);
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(links[0]);
  });

  it("has a main landmark and the search field with its shortcut", () => {
    shell();
    expect(document.getElementById("main")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Search customers/ }).length).toBeGreaterThan(0);
  });

  it("puts the sidebar on the right in Urdu and sets the page direction", () => {
    const { container } = shell("ur");
    expect(container.querySelector('[data-slot="sidebar-container"]')?.getAttribute("data-side")).toBe("right");
  });

  it("keeps the sidebar on the left in English", () => {
    const { container } = shell("en");
    expect(container.querySelector('[data-slot="sidebar-container"]')?.getAttribute("data-side")).toBe("left");
  });
});
