import { describe, expect, it } from "vitest";
import type { Vars } from "@ll/shared";
import { en } from "@ll/shared/messages/en";
import { hi } from "@ll/shared/messages/hi";
import { pa } from "@ll/shared/messages/pa";
import { ur } from "@ll/shared/messages/ur";
import { ApiError, ENGLISH_LINE, errorKind, errorMessage, fieldIssues, isRetryable, kindFromEnglishLine, parseRetryAfter, toApiError } from "@/lib/api/errors";
import { LINE_KEY, fieldErrors, userMessage, waitText } from "@/lib/api/userError";
import { audienceFromPath, merchantBase } from "@/components/errors/audience";
import { notFoundContext } from "@/components/errors/notFoundCopy";
import { loginHref } from "@/lib/api/sessionEvents";

const t = (key: keyof typeof en, vars?: Vars) => {
  let m: string = en[key];
  const plural = /^\{n, plural, one \{([^}]*)\} other \{([^}]*)\}\}$/.exec(m);
  if (plural && vars) m = Number(vars.n) === 1 ? plural[1]! : plural[2]!;
  return m.replace(/#/g, String(vars?.n ?? "#")).replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? `{${k}}`));
};

const err = (status: number, code = "x", message = "Server words", details?: unknown) => new ApiError(status, code, message, details);

describe("errorKind", () => {
  it("classifies every status the app sees", () => {
    expect(errorKind(ApiError.network())).toBe("network");
    expect(errorKind(err(502, "network_error"))).toBe("network"); // the proxy's answer when the API is down
    expect(errorKind(err(401))).toBe("session");
    expect(errorKind(err(403))).toBe("forbidden");
    expect(errorKind(err(404))).toBe("notFound");
    expect(errorKind(err(410))).toBe("notFound");
    expect(errorKind(err(409))).toBe("conflict");
    expect(errorKind(err(429))).toBe("rateLimited");
    expect(errorKind(err(400))).toBe("validation");
    expect(errorKind(err(422))).toBe("validation");
    expect(errorKind(err(500))).toBe("server");
    expect(errorKind(err(503))).toBe("server");
    expect(errorKind(new Error("boom"))).toBe("generic");
  });

  it("offers a retry only where retrying can help", () => {
    expect(isRetryable(err(500))).toBe(true);
    expect(isRetryable(ApiError.network())).toBe(true);
    expect(isRetryable(err(429))).toBe(true);
    expect(isRetryable(err(401))).toBe(false);
    expect(isRetryable(err(403))).toBe(false);
    expect(isRetryable(err(404))).toBe(false);
    expect(isRetryable(err(400))).toBe(false);
  });
});

describe("Retry-After", () => {
  it("reads seconds and dates", () => {
    expect(parseRetryAfter("45")).toBe(45);
    expect(parseRetryAfter("Wed, 11 Nov 2026 18:00:30 GMT", Date.parse("Wed, 11 Nov 2026 18:00:00 GMT"))).toBe(30);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });

  it("is carried by the error from the header or details.retryAfterSec", () => {
    const h = new Headers({ "retry-after": "60" });
    expect(toApiError(429, { error: { code: "rate_limited", message: "Too many requests" } }, h).retryAfter).toBe(60);
    expect(toApiError(429, { error: { code: "rate_limited", message: "x", details: { retryAfterSec: 3600 } } }).retryAfter).toBe(3600);
    expect(toApiError(500, null).retryAfter).toBeUndefined();
  });

  it("says when to try again, in English and through the catalogue", () => {
    const e = err(429, "rate_limited", "Too many requests");
    e.retryAfter = 45;
    expect(errorMessage(e)).toBe("You’re going a little fast. Try again in 45 seconds.");
    expect(userMessage(e, t, "en")).toBe("You’re going a little fast. Try again in 45 seconds.");
    e.retryAfter = 3600;
    expect(userMessage(e, t, "en")).toContain("1 hour");
    expect(waitText(120, t)).toBe("2 minutes");
    expect(userMessage(err(429), t, "en")).toBe(en["err.rate.lineNoWait"]);
  });
});

describe("errorMessage (English dashboard)", () => {
  it("never says check your connection for a server failure, and never passes through a 5xx body", () => {
    expect(errorMessage(err(500, "internal", 'Internal error: relation "x" does not exist'))).toBe(ENGLISH_LINE.server);
    expect(errorMessage(ApiError.network())).toBe(ENGLISH_LINE.network);
    expect(errorMessage(err(401, "unauthorized", "Please sign in to continue."))).toBe(ENGLISH_LINE.session);
  });
  it("keeps the API's specific sentence for the things it can name", () => {
    expect(errorMessage(err(409, "slot_taken", "That time was just taken."))).toBe("That time was just taken.");
    expect(errorMessage(err(404, "not_found", "We couldn’t find that customer."))).toBe("We couldn’t find that customer.");
  });
  it("English lines match the catalogue (one source of truth)", () => {
    for (const [kind, key] of Object.entries(LINE_KEY)) expect(ENGLISH_LINE[kind as keyof typeof LINE_KEY], kind).toBe(en[key]);
    expect(ENGLISH_LINE.rateLimited).toBe(en["err.rate.lineNoWait"]);
  });
  it("recognises the kind behind a message string", () => {
    expect(kindFromEnglishLine(ENGLISH_LINE.session)).toBe("session");
    expect(kindFromEnglishLine(ENGLISH_LINE.server)).toBe("server");
    expect(kindFromEnglishLine("You’re going a little fast. Try again in 45 seconds.")).toBe("rateLimited");
    expect(kindFromEnglishLine("Something else")).toBeNull();
  });
});

describe("userMessage (translated)", () => {
  it("never shows English server text outside English", () => {
    const e = err(422, "bad_request", "name must contain at least 1 character(s)");
    expect(userMessage(e, t, "en")).toBe("name must contain at least 1 character(s)");
    expect(userMessage(e, t, "ur")).toBe(en["err.validation.line"]);
    expect(userMessage(err(409, "slot_taken", "That time was taken."), t, "hi")).toBe(en["err.conflict.line"]);
  });
  it("lets the screen's own words win for 404 and 409", () => {
    expect(userMessage(err(404), t, "en", { notFound: "That spot is gone." })).toBe("That spot is gone.");
    expect(userMessage(err(409), t, "pa", { conflict: "Someone else took it." })).toBe("Someone else took it.");
  });
  it("uses the network sentence for a dead API and the generic one for a thrown string", () => {
    expect(userMessage(ApiError.network(), t, "en")).toBe(en["err.network.line"]);
    expect(userMessage(new Error("x"), t, "en")).toBe(en["err.generic.line"]);
  });
});

describe("field errors from a 400", () => {
  const e = err(400, "bad_request", "Check the highlighted fields and try again.", [
    { path: "email", message: "Enter a valid email address.", code: "email" },
    { path: "password", message: "Use at least 8 characters", code: "too_short", min: 8 },
    { path: "name", message: "This is required.", code: "required" },
    { path: "name", message: "second problem", code: "too_long", max: 3 },
    { path: "qty", message: "Use 200 or less.", code: "max", max: 200 },
    { path: "slug", message: "That address is taken.", code: "custom" },
    { nonsense: true },
  ]);
  it("normalises details and skips junk", () => {
    expect(fieldIssues(e)).toHaveLength(6);
    expect(fieldIssues(err(500))).toEqual([]);
  });
  it("translates from the code and keeps the first problem per field", () => {
    const en_ = fieldErrors(e, t, "en");
    expect(en_.email).toBe("Enter a valid email address.");
    expect(en_.password).toBe("Use at least 8 characters.");
    expect(en_.name).toBe("This is required.");
    expect(en_.qty).toBe("Use 200 or less.");
    expect(en_.slug).toBe("That address is taken."); // a custom sentence is fine in English
    expect(fieldErrors(e, t, "ur").slug).toBe(en["err.field.invalid"]); // but never outside English
  });
});

describe("error catalogue", () => {
  it("has every err.* key in all four languages", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("err."));
    expect(keys.length).toBeGreaterThan(60);
    for (const [name, cat] of Object.entries({ hi, ur, pa }) as [string, Record<string, string>][]) for (const k of keys) expect(cat[k], `${name} ${k}`).toBeTruthy();
  });
  it("follows the copy rules: curly apostrophes, no exclamation marks, never Log in", () => {
    for (const k of Object.keys(en).filter((k) => k.startsWith("err."))) {
      const v = en[k as keyof typeof en] as string;
      expect(v, k).not.toMatch(/[A-Za-z]'[a-z]/);
      expect(v, k).not.toContain("!");
      expect(v, k).not.toMatch(/log in|founding/i);
    }
  });
  it("keeps the same placeholders in every language", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort().join(",");
    for (const k of Object.keys(en).filter((k) => k.startsWith("err."))) {
      for (const cat of [hi, ur, pa] as Record<string, string>[]) expect(vars(cat[k]!), k).toBe(vars(en[k as keyof typeof en] as string));
    }
  });
});

describe("where you are decides the words", () => {
  it("maps the area to the audience", () => {
    expect(audienceFromPath("/m/abc/customers")).toBe("owner");
    expect(audienceFromPath("/door/abc")).toBe("owner");
    expect(audienceFromPath("/admin/users")).toBe("admin");
    expect(audienceFromPath("/bia")).toBe("staff");
    expect(audienceFromPath("/me")).toBe("customer");
    expect(audienceFromPath("/e/token")).toBe("customer");
    expect(audienceFromPath("/pricing")).toBe("visitor");
    expect(merchantBase("/m/0a1b2c3d-0000-0000-0000-000000000000/customers")).toBe("/m/0a1b2c3d-0000-0000-0000-000000000000");
    expect(merchantBase("/me")).toBeNull();
  });
  it("says what was not found", () => {
    expect(notFoundContext("/shops/nope")).toBe("shop");
    expect(notFoundContext("/c/xx")).toBe("event");
    expect(notFoundContext("/line/abc")).toBe("line");
    expect(notFoundContext("/e/abc")).toBe("link");
    expect(notFoundContext("/whatever")).toBe("page");
    expect(notFoundContext("/anything", { cut: true })).toBe("cut");
  });
  it("sends sign-in back to where the person was, and only to this site", () => {
    expect(loginHref("/m/abc/customers?x=1", { reason: "expired" })).toBe("/login?next=%2Fm%2Fabc%2Fcustomers%3Fx%3D1&reason=expired");
    expect(loginHref("https://evil.example/")).toBe("/login?next=%2F");
    expect(loginHref("//evil.example/")).toBe("/login?next=%2F");
  });
});

describe("counter errors", () => {
  const en_ = { locale: "en" as const, t: (k: keyof typeof en, v?: Vars) => t(k, v) };
  const ur_ = { locale: "ur" as const, t: (k: keyof typeof en, v?: Vars) => t(k, v) };
  it("says the session ended, never the server's raw sentence", async () => {
    const { counterErrorMessage } = await import("@/lib/dashboard/counter");
    expect(counterErrorMessage({ status: 401, code: "unauthorized", message: "Please sign in to continue." }, {}, en_)).toBe(en["err.session.counter"]);
    expect(counterErrorMessage({ status: 422, code: "bad_request", message: "name must contain at least 1 character(s)" }, {}, ur_)).toBe(en["err.validation.line"]);
  });
});

describe("OTP autofill guard (launch)", () => {
  it("refuses a production server with OTP_AUTOFILL=1 and a real API, allows the local end-to-end setup", async () => {
    const { assertNoOtpAutofillInProduction, isLocalUrl } = await import("@/lib/env");
    expect(() => assertNoOtpAutofillInProduction({ NODE_ENV: "production", OTP_AUTOFILL: "1", NEXT_PUBLIC_API_URL: "https://api.example.ca" })).toThrow(/OTP_AUTOFILL/);
    expect(() => assertNoOtpAutofillInProduction({ NODE_ENV: "production", OTP_AUTOFILL: "1", NEXT_PUBLIC_API_URL: "http://localhost:4100" })).not.toThrow();
    expect(() => assertNoOtpAutofillInProduction({ NODE_ENV: "production", NEXT_PUBLIC_API_URL: "https://api.example.ca" })).not.toThrow();
    expect(() => assertNoOtpAutofillInProduction({ NODE_ENV: "development", OTP_AUTOFILL: "1", NEXT_PUBLIC_API_URL: "https://api.example.ca" })).not.toThrow();
    expect(isLocalUrl("http://127.0.0.1:4000")).toBe(true);
    expect(isLocalUrl("https://api.localloyalty.ca")).toBe(false);
  });
});

describe("401s that are not a lost session", () => {
  const pin = toApiError(401, { error: { code: "invalid_pin", message: "That PIN is not right." } }, new Headers());
  const gone = toApiError(401, { error: { code: "unauthorized", message: "Session expired. Sign in again." } }, new Headers());
  it("a wrong staff PIN is a wrong entry with the API's sentence, not 'your session ended'", () => {
    expect(errorKind(pin)).toBe("validation");
    expect(errorMessage(pin)).toBe("That PIN is not right.");
    expect(errorKind(gone)).toBe("session");
  });
  it("an expired one-time link reads as gone", () => {
    expect(errorKind(toApiError(401, { error: { code: "link_expired", message: "This link has expired." } }, new Headers()))).toBe("notFound");
  });
});
