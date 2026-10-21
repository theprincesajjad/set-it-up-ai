import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { EXPO_PUSH_URL, expoPush } from "../src/providers/expo-push.js";
import { createRealProviders } from "../src/providers/real.js";
import { resendEmail } from "../src/providers/resend.js";
import { twilioSms, twiml } from "../src/providers/twilio.js";
import { fakeFetch } from "./integrations-support.js";

describe("real providers", () => {
  it("twilio sends via Messaging Service with basic auth", async () => {
    const f = fakeFetch([["POST", "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json", () => ({ status: 201, json: { sid: "SM1" } })]]);
    const sms = twilioSms({ accountSid: "AC123", authToken: "tok", messagingServiceSid: "MG1" }, f);
    expect(await sms.send("+14165550123", "Hi")).toEqual({ id: "SM1" });
    const body = new URLSearchParams(f.calls[0]!.body!);
    expect(Object.fromEntries(body)).toEqual({ To: "+14165550123", Body: "Hi", MessagingServiceSid: "MG1" });
    expect(f.calls[0]!.headers.authorization).toBe(`Basic ${Buffer.from("AC123:tok").toString("base64")}`);
    const bad = twilioSms({ accountSid: "AC123", authToken: "tok", from: "+14165550000" }, fakeFetch([["POST", "https://api.twilio.com/", () => ({ status: 400, json: { code: 21211, message: "Invalid To" } })]]));
    await expect(bad.send("x", "y")).rejects.toThrow(/21211/);
    expect(twiml("a & b")).toContain("<Message>a &amp; b</Message>");
    expect(twiml(null)).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

  it("resend posts JSON with bearer auth", async () => {
    const f = fakeFetch([["POST", "https://api.resend.com/emails", () => ({ json: { id: "em_1" } })]]);
    const email = resendEmail({ apiKey: "re_x", from: "Shop <a@b.c>" }, f);
    expect(await email.send({ to: "c@d.e", subject: "S", text: "T" })).toEqual({ id: "em_1" });
    expect(JSON.parse(f.calls[0]!.body!)).toMatchObject({ from: "Shop <a@b.c>", to: ["c@d.e"], subject: "S", text: "T" });
    expect(f.calls[0]!.headers.authorization).toBe("Bearer re_x");
  });

  it("expo chunks by 100 and reports DeviceNotRegistered tokens", async () => {
    const invalid: string[] = [];
    const f = fakeFetch([
      [
        "POST",
        EXPO_PUSH_URL,
        (c) => {
          const msgs = JSON.parse(c.body!) as { to: string }[];
          return { json: { data: msgs.map((m) => (m.to === "bad" ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "t" })) } };
        },
      ],
    ]);
    const push = expoPush({ onInvalidToken: (t) => void invalid.push(t) }, f);
    const msgs = Array.from({ length: 250 }, (_, i) => ({ token: i === 7 ? "bad" : `ExponentPushToken[${i}]`, title: "t", body: "b" }));
    expect(await push.send(msgs)).toEqual({ ok: 249, failed: 1 });
    expect(f.calls.map((c) => JSON.parse(c.body!).length)).toEqual([100, 100, 50]);
    expect(invalid).toEqual(["bad"]);
  });

  it("createRealProviders wires real providers only when configured", () => {
    const none = createRealProviders(loadConfig({ NODE_ENV: "test" }));
    expect([none.sms.name, none.email.name, none.push.name]).toEqual(["console", "console", "console"]);
    const all = createRealProviders(
      loadConfig({ NODE_ENV: "test", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+14165550000", RESEND_API_KEY: "re", EXPO_ACCESS_TOKEN: "ex" }),
      { fetch: fakeFetch([]) },
    );
    expect([all.sms.name, all.email.name, all.push.name]).toEqual(["twilio", "resend", "expo"]);
    // SID without a sender falls back to console instead of crashing.
    const partial = createRealProviders(loadConfig({ NODE_ENV: "test", TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" }));
    expect(partial.sms.name).toBe("console");
  });
});
