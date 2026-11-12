import { describe, expect, it } from "vitest";
import { AGENT_TEXTS, WIDGET_TEXTS, en } from "@ll/shared";
import { LANDING_VARIANTS, copy } from "@/copy/en-CA";
import { SOLO_COMPETITORS } from "@/lib/marketing/competitors-solo";
import { PLAN_COPY } from "@/lib/marketing/plan-copy";

/**
 * The copy rules for everything a visitor reads on the public site (the launch brief): curly apostrophes, no exclamation marks, never
 * the word "founding", and "Sign in" (never "Log in"). Every string of the marketing copy is walked, so a new line cannot slip through.
 */

/** Every string in a value, with the path it was found at. Functions are called with placeholder arguments. */
function strings(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === "string") out.push([path, value]);
  else if (typeof value === "function") strings((value as (...a: unknown[]) => unknown)({ whatsapp: false }, "x"), `${path}()`, out);
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out);
  return out;
}

const MARKETING_SECTIONS = ["nav", "landing", "pricing", "forms", "restaurants", "bia", "solo", "soloPricing", "proPricing"] as const;
const MESSAGE_PREFIXES = ["mkt.nav.", "mkt.rest.", "sh.fs."];

const all: [string, string][] = [
  ...MARKETING_SECTIONS.flatMap((k) => strings(copy[k], `copy.${k}`)),
  ...strings(LANDING_VARIANTS, "LANDING_VARIANTS"),
  ...strings(PLAN_COPY, "PLAN_COPY"),
  ...strings(SOLO_COMPETITORS, "SOLO_COMPETITORS"),
  ...strings(WIDGET_TEXTS.en, "WIDGET_TEXTS.en"),
  // The chat's own lines. The text-message code (otpSms) stays in the basic character set a single text segment can carry.
  ...strings({ ...AGENT_TEXTS.en, otpSms: undefined }, "AGENT_TEXTS.en"),
  ...Object.entries(en as Record<string, string>).filter(([k]) => MESSAGE_PREFIXES.some((p) => k.startsWith(p))).map(([k, v]): [string, string] => [`en["${k}"]`, v]),
  // The one place a failed page load on the marketing site reads from outside those sections.
  ["copy.err.network", copy.err.network],
  ["copy.empty.noNeighbourhood.title", copy.empty.noNeighbourhood.title],
];

describe("marketing copy rules", () => {
  it("covers the marketing copy", () => {
    expect(all.length).toBeGreaterThan(800);
  });
  it("uses curly apostrophes", () => {
    // A straight apostrophe between or after letters ("don't", "cooks' language"). URLs and code have none of these.
    expect(all.filter(([, s]) => /[A-Za-z}]'(?=[A-Za-z\s.,]|$)/.test(s)).map(([p, s]) => `${p}: ${s}`)).toEqual([]);
  });
  it("has no exclamation marks", () => {
    expect(all.filter(([, s]) => s.includes("!")).map(([p, s]) => `${p}: ${s}`)).toEqual([]);
  });
  it("never says founding, and says Sign in, never Log in", () => {
    expect(all.filter(([, s]) => /founding|\blog[ -]?in\b|\blog[ -]?out\b/i.test(s)).map(([p, s]) => `${p}: ${s}`)).toEqual([]);
  });
});
