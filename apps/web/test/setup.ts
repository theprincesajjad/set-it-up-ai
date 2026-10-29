import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { CATALOGS, type Locale } from "@ll/shared";
import { primeCatalog } from "@/lib/i18n/catalog";

afterEach(() => cleanup());

// The browser loads one catalogue on demand (lib/i18n/catalog.ts); tests render synchronously, so every catalogue is in the cache up front.
for (const [l, m] of Object.entries(CATALOGS)) primeCatalog(l as Locale, m);

// next/navigation is only available inside the Next runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// jsdom has no <dialog> methods.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}
