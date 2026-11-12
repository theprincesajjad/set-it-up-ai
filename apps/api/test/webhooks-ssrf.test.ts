/**
 * Outbound webhooks must never reach an internal address (API-08, SEC-03): names are resolved, every address must be public, the check
 * runs again at every delivery, and the delivery connects to the address that was checked.
 */
import http from "node:http";
import { eq } from "drizzle-orm";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { outboundWebhookDeliveries } from "@ll/db";
import { emitMerchantEvent, flushMerchantEvents, deliverDueWebhooks, pinnedPost } from "../src/services/webhooks-out.js";
import { createMerchant as createBaseMerchant, createTestEnv, grantFeatures, type TestEnv } from "./helpers.js";
import { fakeFetch } from "./integrations-support.js";

let env: TestEnv;
let dns: Record<string, string[]>;
beforeEach(async () => {
  env = await createTestEnv();
  dns = { "hooks.example.com": ["93.184.216.34"] };
  env.ctx.providers.siteImportNet = { lookup: async (host) => dns[host] ?? Promise.reject(new Error("ENOTFOUND")) };
});
afterEach(async () => env.close());

async function shop() {
  const m = await createBaseMerchant(env);
  await grantFeatures(env, m.merchant.id, ["integrations.webhooks"]);
  env.ctx.config.env = "production";
  const post = (url: string, events = ["*"]) =>
    env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/webhooks`, headers: { authorization: `Bearer ${m.ownerToken}` }, payload: { url, events } });
  return { m, post };
}

describe("webhook URLs are checked by address, not just by name", () => {
  it("refuses every internal form, including IPv4-mapped IPv6, the unspecified address and a trailing dot", async () => {
    const { post } = await shop();
    const bad = [
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://[::]/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://[::ffff:7f00:1]/x",
      "https://[::ffff:169.254.169.254]/latest/meta-data",
      "https://[64:ff9b::7f00:1]/x",
      "https://169.254.169.254/latest/meta-data",
      "https://10.1.2.3/x",
      "https://192.168.0.9/x",
      "https://100.64.0.1/x",
      "https://[fd00::1]/x",
      "https://[fe80::1]/x",
      "https://2130706433/x", // 127.0.0.1 written as one number
      "https://0x7f.0.0.1/x",
      "https://localhost./x",
      "https://app.localhost/x",
      "https://db.internal/x",
      "http://hooks.example.com/x",
    ];
    for (const url of bad) {
      const r = await post(url);
      expect(r.statusCode, url).toBe(400);
    }
  });

  it("resolves the name: a name that points inside is refused, even when one of its addresses is public", async () => {
    const { post } = await shop();
    dns["127.0.0.1.nip.io"] = ["127.0.0.1"];
    dns["metadata.rebind.example"] = ["169.254.169.254"];
    dns["mixed.example.com"] = ["93.184.216.34", "10.0.0.5"];
    dns["v6.example.com"] = ["::ffff:7f00:1"];
    for (const host of ["127.0.0.1.nip.io", "metadata.rebind.example", "mixed.example.com", "v6.example.com"]) {
      const r = await post(`https://${host}/hook`);
      expect(r.statusCode, host).toBe(400);
      expect(r.json().error.message, host).toBe("Webhook URL must be a public address");
    }
    const unknown = await post("https://no-such-host.example.org/hook");
    expect(unknown.statusCode).toBe(400);
    expect((await post("https://hooks.example.com/hook")).statusCode).toBe(201);
  });

  it("the same check applies when the URL of an existing webhook is changed", async () => {
    const { m, post } = await shop();
    const w = (await post("https://hooks.example.com/hook")).json();
    dns["evil.example.com"] = ["127.0.0.1"];
    const r = await env.app.inject({ method: "PATCH", url: `/v1/merchants/${m.merchant.id}/webhooks/${w.id}`, headers: { authorization: `Bearer ${m.ownerToken}` }, payload: { url: "https://evil.example.com/x" } });
    expect(r.statusCode).toBe(400);
  });

  it("checks again at every delivery: a name that later points inside gets nothing sent, and the failure is recorded", async () => {
    const { m, post } = await shop();
    const w = (await post("https://hooks.example.com/hook", ["points.earned"])).json();
    // DNS rebinding: it was public when saved and is internal now.
    dns["hooks.example.com"] = ["169.254.169.254"];
    await emitMerchantEvent(env.ctx, m.merchant.id, "points.earned", { points: 5 });
    await flushMerchantEvents();
    const fake = fakeFetch([["POST", "https://hooks.example.com/", () => ({ status: 200 })]]);
    const r = await deliverDueWebhooks(env.ctx, fake);
    expect(fake.calls).toHaveLength(0);
    expect(r.delivered).toBe(0);
    const [d] = await env.db.select().from(outboundWebhookDeliveries).where(eq(outboundWebhookDeliveries.webhookId, w.id));
    expect(d!.status).toBe("pending"); // it retries later, in case the name is fixed
    expect(d!.lastError).toBe("Webhook URL must be a public address");
    // Fixed: the retry goes out.
    dns["hooks.example.com"] = ["93.184.216.34"];
    env.clock.now = new Date(env.clock.now.getTime() + 60_000);
    expect((await deliverDueWebhooks(env.ctx, fake)).delivered).toBe(1);
    expect(fake.calls).toHaveLength(1);
  });

  it("never follows a redirect: a 302 to an internal address counts as a failed delivery", async () => {
    const { m, post } = await shop();
    await post("https://hooks.example.com/hook", ["points.earned"]);
    await emitMerchantEvent(env.ctx, m.merchant.id, "points.earned", { points: 5 });
    await flushMerchantEvents();
    const fake = fakeFetch([["POST", "https://hooks.example.com/", () => ({ status: 302 })]]);
    const r = await deliverDueWebhooks(env.ctx, fake);
    expect(r.delivered).toBe(0);
    expect(fake.calls).toHaveLength(1); // only the one request; the Location was not requested
  });

  it("outside production a developer can still use a local receiver", async () => {
    const m = await createBaseMerchant(env);
    await grantFeatures(env, m.merchant.id, ["integrations.webhooks"]);
    const r = await env.app.inject({ method: "POST", url: `/v1/merchants/${m.merchant.id}/webhooks`, headers: { authorization: `Bearer ${m.ownerToken}` }, payload: { url: "http://localhost:9999/hook", events: ["*"] } });
    expect(r.statusCode).toBe(201);
  });
});

describe("the delivery connects to the address that was checked", () => {
  it("sends to the pinned address with the name only in the Host header", async () => {
    const seen: { host?: string; path?: string; body: string; sig?: string }[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        seen.push({ host: req.headers.host, path: req.url, body, sig: String(req.headers["x-ll-signature"] ?? "") });
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    try {
      // The name "hooks.example.test" does not resolve anywhere: only the pinned address can have been used.
      const res = await pinnedPost(new URL(`http://hooks.example.test:${port}/a/b?x=1`), "127.0.0.1", { "content-type": "application/json", "x-ll-signature": "t=1,v1=abc" }, '{"hello":"world"}', 5000);
      expect(res.status).toBe(204);
      expect(seen).toEqual([{ host: `hooks.example.test:${port}`, path: "/a/b?x=1", body: '{"hello":"world"}', sig: "t=1,v1=abc" }]);
    } finally {
      server.close();
    }
  });
});
