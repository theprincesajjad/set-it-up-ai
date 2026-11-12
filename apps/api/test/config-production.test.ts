import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { FakePayments } from "../src/providers/paymentsFake.js";
import { createPaymentsProvider } from "../src/providers/payments.js";
import { PROD_ENV } from "./prodEnv.js";

describe("production boot checks", () => {
  it("boots with a complete, real configuration", () => {
    const c = loadConfig(PROD_ENV as never);
    expect(c.env).toBe("production");
    expect(c.email.provider).toBe("resend");
  });

  it("lists every problem at once", () => {
    let message = "";
    try {
      loadConfig({ NODE_ENV: "production", JWT_SECRET: "short", ENCRYPTION_KEY: "abc" } as never);
    } catch (e) {
      message = (e as Error).message;
    }
    for (const name of ["JWT_SECRET", "ENCRYPTION_KEY", "PUBLIC_API_URL", "PUBLIC_WEB_URL", "CORS_ORIGINS", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "EMAIL_FROM", "WHATSAPP_ACCESS_TOKEN", "APP_ENCRYPTION_KEY", "SUPPORT_EMAIL", "LEGAL_ENTITY_NAME", "TWILIO_ACCOUNT_SID"]) expect(message, name).toContain(name);
  });

  it.each([
    ["a localhost API address", { PUBLIC_API_URL: "http://localhost:4000" }, /PUBLIC_API_URL/],
    ["a plain http web address", { PUBLIC_WEB_URL: "http://shop-loyalty.ca" }, /PUBLIC_WEB_URL/],
    ["a placeholder CORS origin", { CORS_ORIGINS: "https://app.example" }, /CORS_ORIGINS/],
    ["a placeholder sender", { EMAIL_FROM: "Local Loyalty <hello@localloyalty.example>" }, /EMAIL_FROM/],
    ["a placeholder support address", { SUPPORT_EMAIL: "hello@localloyalty.example" }, /SUPPORT_EMAIL/],
    ["a short signing secret", { JWT_SECRET: "x".repeat(31) }, /JWT_SECRET/],
    ["an all-zero encryption key", { ENCRYPTION_KEY: "0".repeat(64) }, /ENCRYPTION_KEY/],
    ["the public fake webhook secret", { STRIPE_WEBHOOK_SECRET: "whsec_fake_local_dev" }, /STRIPE_WEBHOOK_SECRET/],
  ])("refuses %s", (_name, patch, re) => {
    expect(() => loadConfig({ ...PROD_ENV, ...patch } as never)).toThrow(re);
  });

  it("refuses an unknown NODE_ENV instead of treating it as development", () => {
    expect(() => loadConfig({ ...PROD_ENV, NODE_ENV: "staging" } as never)).toThrow(/NODE_ENV/);
    expect(loadConfig({ NODE_ENV: "development" } as never).env).toBe("development");
    expect(loadConfig({} as never).env).toBe("development");
  });

  it("lets a staging server opt out one check at a time", () => {
    const staging = { ...PROD_ENV, STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", ALLOW_FAKE_PAYMENTS: "1", RESEND_API_KEY: "", ALLOW_CONSOLE_EMAIL: "1", WHATSAPP_ACCESS_TOKEN: "", WHATSAPP_DISABLED: "1" };
    expect(() => loadConfig(staging as never)).not.toThrow();
  });

  it("will not build the fake payments provider in production, and the fake never verifies with its public secret", () => {
    const cfg = loadConfig({ ...PROD_ENV, STRIPE_SECRET_KEY: "", ALLOW_FAKE_PAYMENTS: "1" } as never);
    delete process.env.ALLOW_FAKE_PAYMENTS;
    expect(() => createPaymentsProvider(cfg)).toThrow(/fake payments/);
    const fake = new FakePayments({ ...cfg, stripe: { ...cfg.stripe, webhookSecret: undefined } });
    expect(() => fake.verifyWebhook("{}", "t=1,v1=x")).toThrow(/not configured/);
  });
});
