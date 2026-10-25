import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, merchants, neighbourhoods } from "@ll/db";
import { createMerchant, createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv();
});
afterEach(async () => env.close());

const auth = (t: string) => ({ authorization: `Bearer ${t}` });
async function person(role: "rep" | "admin", name: string) {
  const u = await createUser(env.db, { name, email: `${name.toLowerCase().replace(/\s/g, "")}${Math.random().toString(36).slice(2, 6)}@example.com`, platformRole: role });
  return { user: u, token: await tokenFor(env, u) };
}
const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, token: string, payload?: unknown) => env.app.inject({ method, url, headers: auth(token), payload: payload as never });
const MIN = 60_000;

describe("support sessions gate every platform write inside a shop", () => {
  it("refuses an admin write with 403 support_session_required until a reasoned session is open; reads stay open", async () => {
    const admin = await person("admin", "Ada Admin");
    const m = await createMerchant(env);
    const program = `/v1/merchants/${m.merchant.id}/program`;

    expect((await call("GET", `/v1/merchants/${m.merchant.id}`, admin.token)).statusCode).toBe(200);
    expect((await call("GET", program, admin.token)).statusCode).toBe(200);
    const refused = await call("PATCH", program, admin.token, { welcomeBonus: 10 });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toMatchObject({ code: "support_session_required", details: { merchantId: m.merchant.id } });
    // Nothing was written, nothing was audited as a support write.
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "support.write"))).toHaveLength(0);

    // A reason is required.
    const url = `/v1/admin/merchants/${m.merchant.id}/support-sessions`;
    expect((await call("POST", url, admin.token, {})).statusCode).toBe(400);
    expect((await call("POST", url, admin.token, { reason: "hi" })).statusCode).toBe(400);
    expect((await call("PATCH", program, admin.token, { welcomeBonus: 10 })).statusCode).toBe(403);

    expect((await call("POST", url, admin.token, { reason: "Owner asked us to fix the welcome bonus" })).statusCode).toBe(201);
    expect((await call("PATCH", program, admin.token, { welcomeBonus: 10 })).statusCode).toBe(200);
    const writes = await env.db.select().from(auditLogs).where(eq(auditLogs.action, "support.write"));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ actorUserId: admin.user.id, merchantId: m.merchant.id });
  });

  it("the window closes after 30 minutes and when the session is ended", async () => {
    const admin = await person("admin", "Ada Admin");
    const m = await createMerchant(env);
    const program = `/v1/merchants/${m.merchant.id}/program`;
    const s = (await call("POST", `/v1/admin/merchants/${m.merchant.id}/support-sessions`, admin.token, { reason: "Fix program" })).json();
    expect((await call("PATCH", program, admin.token, { welcomeBonus: 1 })).statusCode).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 29 * MIN);
    expect((await call("PATCH", program, admin.token, { welcomeBonus: 2 })).statusCode).toBe(200);
    env.clock.now = new Date(env.clock.now.getTime() + 2 * MIN);
    expect((await call("PATCH", program, admin.token, { welcomeBonus: 3 })).statusCode).toBe(403);

    const s2 = (await call("POST", `/v1/admin/merchants/${m.merchant.id}/support-sessions`, admin.token, { reason: "Second look" })).json();
    expect((await call("PATCH", program, admin.token, { welcomeBonus: 4 })).statusCode).toBe(200);
    expect((await call("POST", `/v1/admin/support-sessions/${s2.id}/end`, admin.token)).statusCode).toBe(200);
    expect((await call("PATCH", program, admin.token, { welcomeBonus: 5 })).statusCode).toBe(403);
    expect(s.id).not.toBe(s2.id);
  });

  it("a session covers one shop and one person: not another shop, not another admin, never the owner's own writes", async () => {
    const ada = await person("admin", "Ada Admin");
    const bo = await person("admin", "Bo Admin");
    const a = await createMerchant(env);
    const b = await createMerchant(env);
    await call("POST", `/v1/admin/merchants/${a.merchant.id}/support-sessions`, ada.token, { reason: "Help shop A" });
    expect((await call("PATCH", `/v1/merchants/${a.merchant.id}/program`, ada.token, { welcomeBonus: 1 })).statusCode).toBe(200);
    expect((await call("PATCH", `/v1/merchants/${b.merchant.id}/program`, ada.token, { welcomeBonus: 1 })).statusCode).toBe(403);
    expect((await call("PATCH", `/v1/merchants/${a.merchant.id}/program`, bo.token, { welcomeBonus: 1 })).statusCode).toBe(403);
    // The owner never needs one.
    expect((await call("PATCH", `/v1/merchants/${b.merchant.id}/program`, b.ownerToken, { welcomeBonus: 2 })).statusCode).toBe(200);
  });

  it("admin merchant routes need a session too: status change and charge mode", async () => {
    const admin = await person("admin", "Ada Admin");
    const m = await createMerchant(env);
    const status = `/v1/admin/merchants/${m.merchant.id}/status`;
    const mode = `/v1/admin/merchants/${m.merchant.id}/charge-mode`;
    expect((await call("GET", `/v1/admin/merchants/${m.merchant.id}`, admin.token)).statusCode).toBe(200);
    expect((await call("GET", `/v1/admin/merchants/${m.merchant.id}/money`, admin.token)).statusCode).toBe(200);
    const s = await call("POST", status, admin.token, { status: "paused", reason: "Owner asked" });
    expect(s.statusCode).toBe(403);
    expect(s.json().error.code).toBe("support_session_required");
    expect((await call("PUT", mode, admin.token, { chargeMode: "direct", reason: "Per owner request" })).json().error.code).toBe("support_session_required");

    await call("POST", `/v1/admin/merchants/${m.merchant.id}/support-sessions`, admin.token, { reason: "Pause at owner's request" });
    expect((await call("POST", status, admin.token, { status: "paused", reason: "Owner asked" })).statusCode).toBe(200);
    const [row] = await env.db.select().from(merchants).where(eq(merchants.id, m.merchant.id));
    expect(row!.status).toBe("paused");
    // Starting a session never needs one (that is how you get one).
    expect((await call("POST", `/v1/admin/merchants/${m.merchant.id}/support-sessions`, admin.token, { reason: "Another look" })).statusCode).toBe(201);
    // Network-wide admin actions are not shop writes.
    const [hood] = await env.db.select().from(neighbourhoods).limit(1);
    expect(hood).toBeUndefined();
    expect((await call("POST", "/v1/admin/neighbourhoods", admin.token, { slug: "x-hood", name: "X Hood", centerLat: 43.6, centerLng: -79.4, radiusMetres: 500 })).statusCode).toBeLessThan(500);
  });

  it("reps: start a session on their own shop with a reason; other shops are invisible; creating a shop opens the setup session", async () => {
    const rita = await person("rep", "Rita Rep");
    const other = await person("rep", "Omar Rep");
    const m = await createMerchant(env);
    await env.db.update(merchants).set({ repUserId: rita.user.id }).where(eq(merchants.id, m.merchant.id));
    const program = `/v1/merchants/${m.merchant.id}/program`;
    const sess = `/v1/support/merchants/${m.merchant.id}/session`;

    expect((await call("GET", program, rita.token)).statusCode).toBe(200);
    expect((await call("PATCH", program, rita.token, { welcomeBonus: 5 })).json().error.code).toBe("support_session_required");
    expect((await call("GET", sess, rita.token)).json()).toEqual({ session: null });
    expect((await call("POST", sess, rita.token, { reason: "x" })).statusCode).toBe(400);
    expect((await call("POST", sess, other.token, { reason: "Not my shop at all" })).statusCode).toBe(404);
    expect((await call("POST", sess, m.ownerToken, { reason: "I am the owner" })).statusCode).toBe(403);

    const started = await call("POST", sess, rita.token, { reason: "Set up the loyalty program" });
    expect(started.statusCode).toBe(201);
    expect(started.json()).toMatchObject({ active: true, reason: "Set up the loyalty program", adminName: "Rita Rep" });
    expect((await call("GET", sess, rita.token)).json().session).toMatchObject({ id: started.json().id, active: true });
    expect((await call("PATCH", program, rita.token, { welcomeBonus: 5 })).statusCode).toBe(200);
    expect((await env.db.select().from(auditLogs).where(and(eq(auditLogs.action, "rep.write"), eq(auditLogs.merchantId, m.merchant.id))))).toHaveLength(1);

    // Only the person who opened it can end it.
    expect((await call("POST", `/v1/support/sessions/${started.json().id}/end`, other.token)).statusCode).toBe(404);
    expect((await call("POST", `/v1/support/sessions/${started.json().id}/end`, rita.token)).statusCode).toBe(200);
    expect((await call("PATCH", program, rita.token, { welcomeBonus: 6 })).statusCode).toBe(403);

    // Done-for-you setup: the new shop comes with a reasoned session for the rep who created it.
    const created = await call("POST", "/v1/rep/merchants", rita.token, { name: "Roncy Repair", vertical: "repair_electronics", address: "200 Roncesvalles Ave", phone: "4165552222", owner: { name: "Omar", email: "omar@roncyrepair.example" } });
    expect(created.statusCode).toBe(201);
    const id = created.json().merchant.id as string;
    expect((await call("PATCH", `/v1/merchants/${id}/program`, rita.token, { welcomeBonus: 100 })).statusCode).toBe(200);
    expect((await call("GET", `/v1/support/merchants/${id}/session`, rita.token)).json().session).toMatchObject({ reason: "Done-for-you setup" });
    env.clock.now = new Date(env.clock.now.getTime() + 31 * MIN);
    expect((await call("PATCH", `/v1/merchants/${id}/program`, rita.token, { welcomeBonus: 101 })).statusCode).toBe(403);
  });

  it("support endpoints need a platform role", async () => {
    const m = await createMerchant(env);
    const nobody = await createUser(env.db, {});
    expect((await call("POST", `/v1/support/merchants/${m.merchant.id}/session`, await tokenFor(env, nobody), { reason: "Let me in please" })).statusCode).toBe(403);
    expect((await env.app.inject({ method: "GET", url: `/v1/support/merchants/${m.merchant.id}/session` })).statusCode).toBe(401);
  });
});
