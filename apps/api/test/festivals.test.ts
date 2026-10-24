import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, featureOverrides, merchantOccasions, messageDeliveries, messages, users } from "@ll/db";
import { FESTIVALS, FESTIVAL_YEARS, addDays, daysBetween, festivalOccurrences, formatFestivalDate, getFestival } from "@ll/shared";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { connectWhatsapp, req, restaurantShop, wa } from "./restaurant-msg-fixtures.js";

let env: TestEnv;
beforeEach(async () => {
  env = await createTestEnv(); // clock: 2026-11-03T15:00Z
});
afterEach(async () => env.close());

const start = (id: string, year: number) => getFestival(id)!.dates[String(year)]!.start;

describe("festival calendar 2026-2028", () => {
  it("has every required festival with a date for each of the three years", () => {
    const required = ["ramadan", "eid_al_fitr", "eid_al_adha", "muharram", "ashura", "mawlid", "diwali", "holi", "vaisakhi", "navratri", "dussehra", "raksha_bandhan", "lohri", "pakistan_independence", "india_independence", "bangladesh_victory", "chaand_raat", "karva_chauth", "gurpurab"];
    for (const id of required) {
      const f = getFestival(id);
      expect(f, id).toBeDefined();
      for (const y of FESTIVAL_YEARS) {
        const d = f!.dates[String(y)];
        expect(d, `${id} ${y}`).toBeDefined();
        expect(d!.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("has the right dates for the fixed-date occasions", () => {
    for (const y of FESTIVAL_YEARS) {
      expect(start("pakistan_independence", y)).toBe(`${y}-08-14`);
      expect(start("india_independence", y)).toBe(`${y}-08-15`);
      expect(start("bangladesh_victory", y)).toBe(`${y}-12-16`);
      expect(start("lohri", y)).toBe(`${y}-01-13`);
    }
    expect(start("vaisakhi", 2026)).toBe("2026-04-14");
    expect(start("vaisakhi", 2028)).toBe("2028-04-13");
    for (const id of ["pakistan_independence", "india_independence", "bangladesh_victory", "lohri", "vaisakhi"]) expect(getFestival(id)!.approximate, id).toBe(false);
  });

  it("has the expected lunar dates (Umm al-Qura for Islamic, tithi for the rest) and marks them approximate", () => {
    expect(start("ramadan", 2026)).toBe("2026-02-18");
    expect(start("ramadan", 2027)).toBe("2027-02-08");
    expect(start("ramadan", 2028)).toBe("2028-01-28");
    expect(start("eid_al_fitr", 2026)).toBe("2026-03-20");
    expect(start("eid_al_fitr", 2027)).toBe("2027-03-09");
    expect(start("eid_al_adha", 2026)).toBe("2026-05-27");
    expect(start("eid_al_adha", 2028)).toBe("2028-05-05");
    expect(start("diwali", 2026)).toBe("2026-11-08");
    expect(start("diwali", 2027)).toBe("2027-10-29");
    expect(start("diwali", 2028)).toBe("2028-10-17");
    expect(start("holi", 2026)).toBe("2026-03-04");
    expect(start("chaand_raat", 2026)).toBe(addDays(start("eid_al_fitr", 2026), -1));
    expect(start("chaand_raat", 2027)).toBe(addDays(start("eid_al_fitr", 2027), -1));
    // Ramadan runs 29-30 days and ends the day before Eid.
    for (const y of FESTIVAL_YEARS) {
      const r = getFestival("ramadan")!.dates[String(y)]!;
      expect(daysBetween(r.start, r.end!)).toBeGreaterThanOrEqual(28);
      expect(daysBetween(r.end!, start("eid_al_fitr", y))).toBe(1);
    }
    for (const id of ["ramadan", "eid_al_fitr", "eid_al_adha", "muharram", "ashura", "mawlid", "diwali", "holi", "navratri", "dussehra", "raksha_bandhan", "karva_chauth", "gurpurab", "chaand_raat"]) {
      const f = getFestival(id)!;
      expect(f.approximate, id).toBe(true);
      expect(f.dateNote.toLowerCase(), id).toContain("confirm locally");
    }
    // Diwali falls on a different day each year, in the right season.
    for (const y of FESTIVAL_YEARS) expect(["10", "11"]).toContain(start("diwali", y).slice(5, 7));
    expect(new Set(FESTIVALS.map((f) => f.id)).size).toBe(FESTIVALS.length);
  });

  it("every festival has templates for all four channels and sends that point at real templates", () => {
    for (const f of FESTIVALS) {
      expect(f.templates.length, f.id).toBeGreaterThan(0);
      for (const t of f.templates) {
        expect(t.subject.length).toBeGreaterThan(5);
        expect(t.body.length).toBeGreaterThan(20);
        expect(t.sms.length, `${f.id}/${t.id} sms`).toBeLessThanOrEqual(200);
        expect(t.whatsapp.length).toBeGreaterThan(20);
        expect(t.whatsappTemplateName).toMatch(/^[a-z0-9_]+$/);
        for (const text of [t.subject, t.body, t.sms, t.whatsapp]) expect(text, `${f.id}/${t.id}`).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
      }
      expect(f.sends.length, f.id).toBeGreaterThan(0);
      for (const s of f.sends) expect(f.templates.map((t) => t.id), `${f.id} send ${s.templateId}`).toContain(s.templateId);
    }
  });

  it("recommends iftar specials every day of Ramadan and mithai pre-orders 10 days before Diwali and Eid", () => {
    const ramadan = getFestival("ramadan")!;
    const daily = ramadan.sends.find((s) => s.repeat)!;
    expect(daily.repeat).toMatchObject({ everyDays: 1 });
    expect(daily.repeat!.untilOffsetDays).toBeGreaterThanOrEqual(27);
    for (const id of ["diwali", "eid_al_fitr"]) expect(getFestival(id)!.sends.some((s) => s.offsetDays === -10 && /pre-order/i.test(s.label)), id).toBe(true);
  });

  it("finds what is coming up in a window, with send dates", () => {
    const list = festivalOccurrences("2026-11-03", "2026-12-31");
    const ids = list.map((o) => o.festivalId);
    expect(ids).toContain("diwali");
    expect(ids).toContain("gurpurab");
    expect(ids).toContain("bangladesh_victory");
    const diwali = list.find((o) => o.festivalId === "diwali")!;
    expect(diwali).toMatchObject({ startDate: "2026-11-08", daysUntil: 5, approximate: true });
    expect(diwali.sends.find((s) => s.templateId === "diwali_mithai_preorder")!.date).toBe("2026-10-29");
    // Sorted by date.
    expect([...list].map((o) => o.startDate)).toEqual([...list].map((o) => o.startDate).sort());
    // A festival under way is included (Ramadan 2027 on day 3).
    expect(festivalOccurrences("2027-02-10", "2027-02-11").some((o) => o.festivalId === "ramadan")).toBe(true);
    expect(formatFestivalDate("2026-11-08")).toBe("Sunday, November 8");
  });
});

describe("festival endpoints", () => {
  it("lists upcoming festivals for a Growth shop in its own time zone, and locks Starter", async () => {
    const shop = await restaurantShop(env, "growth");
    const r = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/festivals/upcoming?days=60`);
    expect(r.status).toBe(200);
    expect(r.body.today).toBe("2026-11-03");
    const ids = r.body.items.map((i: { festivalId: string }) => i.festivalId);
    expect(ids).toEqual(expect.arrayContaining(["diwali", "gurpurab", "bangladesh_victory"]));
    expect(r.body.items.find((i: { festivalId: string }) => i.festivalId === "diwali")).toMatchObject({ approximate: true, startDate: "2026-11-08" });

    const starter = await restaurantShop(env, "starter");
    expect((await req(env, starter.ownerToken, "GET", `/v1/merchants/${starter.merchant.id}/festivals/upcoming`)).status).toBe(402);
    expect((await req(env, null, "GET", `/v1/merchants/${shop.merchant.id}/festivals/upcoming`)).status).toBe(401);
  });

  it("creates an email draft from a template through the messaging service", async () => {
    const shop = await restaurantShop(env, "growth");
    const r = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/festivals/diwali/campaign-drafts`, { templateId: "diwali_mithai_preorder", channel: "email" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ festivalId: "diwali", year: 2026, channel: "email", approximate: true });
    expect(r.body.body).toContain("Sunday, November 8");
    expect(r.body.body).toContain("{{first_name}}"); // filled per recipient when sent
    const [m] = await env.db.select().from(messages).where(eq(messages.id, r.body.messageId));
    expect(m).toMatchObject({ merchantId: shop.merchant.id, channel: "email", status: "draft", segment: { kind: "all" } });
    expect(m!.subject).toContain("{{merchant}}");
    // Visible through the normal campaigns API too.
    const detail = await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/messages/${r.body.messageId}`);
    expect(detail.status).toBe(200);
  });

  it("schedules an SMS draft with a segment and picks the next occurrence by default, or a chosen year", async () => {
    const shop = await restaurantShop(env, "growth");
    const when = new Date(env.clock.now.getTime() + 3 * 86400_000).toISOString();
    const r = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/festivals/eid_al_fitr/campaign-drafts`, { templateId: "eid_fitr_preorder", channel: "sms", segment: { kind: "lapsed", days: 30 }, scheduledAt: when });
    expect(r.status).toBe(201);
    expect(r.body.year).toBe(2027); // 2026 Eid has passed on 2026-11-03
    const [m] = await env.db.select().from(messages).where(eq(messages.id, r.body.messageId));
    expect(m).toMatchObject({ channel: "sms", status: "scheduled", segment: { kind: "lapsed", days: 30 } });
    const y = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/festivals/eid_al_fitr/campaign-drafts`, { templateId: "eid_greeting", channel: "email", year: 2028 });
    expect(y.body.year).toBe(2028);
  });

  it("returns WhatsApp text and the template name to broadcast, without saving a message", async () => {
    const shop = await restaurantShop(env, "growth");
    const r = await req(env, shop.ownerToken, "POST", `/v1/merchants/${shop.merchant.id}/festivals/diwali/campaign-drafts`, { templateId: "diwali_greeting", channel: "whatsapp" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ channel: "whatsapp", messageId: null, whatsapp: { templateName: "diwali_greeting", approved: false } });
    expect(r.body.whatsapp.freeFormText).toContain("Happy Diwali");
    expect(await env.db.select().from(messages).where(eq(messages.merchantId, shop.merchant.id))).toHaveLength(0);
  });

  it("404s an unknown festival or template and 400s a year that is not in the calendar", async () => {
    const shop = await restaurantShop(env, "growth");
    const url = (f: string) => `/v1/merchants/${shop.merchant.id}/festivals/${f}/campaign-drafts`;
    expect((await req(env, shop.ownerToken, "POST", url("nope"), { templateId: "x", channel: "email" })).status).toBe(404);
    expect((await req(env, shop.ownerToken, "POST", url("diwali"), { templateId: "nope", channel: "email" })).status).toBe(404);
    expect((await req(env, shop.ownerToken, "POST", url("diwali"), { templateId: "diwali_greeting", channel: "email", year: 2030 })).status).toBe(400);
    expect((await req(env, shop.ownerToken, "GET", `/v1/merchants/${shop.merchant.id}/festivals`)).body.items.length).toBe(FESTIVALS.length);
  });
});

describe("Send me a test", () => {
  const url = (shop: { merchant: { id: string } }, f = "diwali") => `/v1/merchants/${shop.merchant.id}/festivals/${f}/test-send`;

  it("emails only the signed-in owner, with the date filled in and the footer, and saves no draft", async () => {
    const shop = await restaurantShop(env, "growth");
    const before = env.ctx.providers.outbox.email.length;
    const r = await req(env, shop.ownerToken, "POST", url(shop), { templateId: "diwali_mithai_preorder", channel: "email" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ channel: "email", sent: 1, to: [shop.owner.email], smsCreditsUsed: 0, testsRemainingToday: 9 });
    const sent = env.ctx.providers.outbox.email.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(shop.owner.email);
    expect(sent[0]!.subject).toMatch(/^\[Test\] /);
    expect(sent[0]!.text).toContain("Sunday, November 8");
    expect(sent[0]!.text).toContain("Unsubscribe:");
    expect(await env.db.select().from(messages).where(eq(messages.merchantId, shop.merchant.id))).toHaveLength(0);
    const dels = await env.db.select().from(messageDeliveries).where(eq(messageDeliveries.merchantId, shop.merchant.id));
    expect(dels).toHaveLength(1);
    expect(dels[0]).toMatchObject({ messageId: null, userId: shop.owner.id, kind: "transactional" });
  });

  it("texts the owner for one credit, uses an edited body, and needs a phone on the account", async () => {
    const shop = await restaurantShop(env, "growth");
    await env.db.insert(featureOverrides).values({ merchantId: shop.merchant.id, key: "marketing.sms", enabled: true, reason: "pilot" });
    const owner = (await env.db.select().from(users).where(eq(users.id, shop.owner.id)))[0]!;
    await env.db.update(users).set({ phone: "+14165550177" }).where(eq(users.id, owner.id));
    const r = await req(env, shop.ownerToken, "POST", url(shop), { templateId: "diwali_greeting", channel: "sms", body: "Diwali mubarak from us, {{festival_date}}" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ channel: "sms", sent: 1, to: ["+14165550177"], smsCreditsUsed: 1 });
    const last = env.ctx.providers.outbox.sms.at(-1)!;
    expect(last.body).toContain("Diwali mubarak from us, Sunday, November 8");
    expect(last.body).toContain("Reply STOP to unsubscribe");
    await env.db.update(users).set({ phone: null }).where(eq(users.id, owner.id));
    expect((await req(env, shop.ownerToken, "POST", url(shop), { templateId: "diwali_greeting", channel: "sms" })).status).toBe(400);
  });

  it("sends the WhatsApp test to the owner's phone: free text inside the window, an approved template outside it", async () => {
    const shop = await restaurantShop(env, "growth");
    await connectWhatsapp(env, shop, ["diwali_greeting"]);
    await env.db.update(users).set({ phone: "+14165550188" }).where(eq(users.id, shop.owner.id));
    // Not approved with no params and no open window: a clear 409, nothing sent.
    const none = await req(env, shop.ownerToken, "POST", url(shop), { templateId: "diwali_greeting", channel: "whatsapp" });
    expect(none.status).toBe(409);
    expect(wa(env).sent).toHaveLength(0);
    const ok = await req(env, shop.ownerToken, "POST", url(shop), { templateId: "diwali_greeting", channel: "whatsapp", params: ["Biryani House", "Sunday, November 8"] });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ channel: "whatsapp", sent: 1, to: ["+14165550188"] });
    expect(wa(env).sent).toHaveLength(1);
    expect(wa(env).sent[0]).toMatchObject({ kind: "template", template: "diwali_greeting" });
    expect(wa(env).sent[0]!.to.replace(/\D/g, "")).toBe("14165550188");
  });

  it("is manager-only, locked on Starter, 404 for unknown dates and templates, and shares the 10 a day limit", async () => {
    const shop = await restaurantShop(env, "growth");
    expect((await req(env, null, "POST", url(shop), { templateId: "diwali_greeting", channel: "email" })).status).toBe(401);
    expect((await req(env, shop.ownerToken, "POST", url(shop, "nope"), { templateId: "x", channel: "email" })).status).toBe(404);
    expect((await req(env, shop.ownerToken, "POST", url(shop), { templateId: "nope", channel: "email" })).status).toBe(404);
    const starter = await restaurantShop(env, "starter");
    expect((await req(env, starter.ownerToken, "POST", url(starter), { templateId: "diwali_greeting", channel: "email" })).status).toBe(402);
    for (let i = 0; i < 10; i++) expect((await req(env, shop.ownerToken, "POST", url(shop), { templateId: "diwali_greeting", channel: "email" })).status).toBe(200);
    expect((await req(env, shop.ownerToken, "POST", url(shop), { templateId: "diwali_greeting", channel: "email" })).status).toBe(429);
    expect(await env.db.select().from(auditLogs).where(eq(auditLogs.action, "message.test_sent"))).toHaveLength(10);
  });
});

describe("Add my own date", () => {
  const base = (s: { merchant: { id: string } }) => `/v1/merchants/${s.merchant.id}/festivals`;
  const occasion = { name: "Grand reopening", date: "2026-11-20", subject: "Join us on {{festival_date}}", body: "Hi {{first_name}}, {{merchant}} is reopening on {{festival_date}}. Free chai all day." };

  it("adds a dated occasion with its texts, plans it like a festival and lists it with the calendar", async () => {
    const shop = await restaurantShop(env, "growth");
    const add = await req(env, shop.ownerToken, "POST", `${base(shop)}/occasions`, { ...occasion, sms: "Reopening Nov 20: free chai" });
    expect(add.status).toBe(201);
    expect(add.body).toMatchObject({ name: "Grand reopening", date: "2026-11-20", sms: "Reopening Nov 20: free chai", whatsapp: occasion.body });
    const up = await req(env, shop.ownerToken, "GET", `${base(shop)}/upcoming?days=60`);
    const mine = up.body.items.find((i: { festivalId: string }) => i.festivalId === `custom-${add.body.id}`);
    expect(mine).toMatchObject({ name: "Grand reopening", startDate: "2026-11-20", approximate: false, tradition: "custom", relevance: "high", daysUntil: 17 });
    expect(mine.sends.map((x: { date: string }) => x.date)).toEqual(["2026-11-17", "2026-11-19"]);
    expect(mine.custom.body).toContain("Free chai");
    expect(up.body.items.some((i: { festivalId: string }) => i.festivalId === "diwali")).toBe(true);
  });

  it("creates drafts and tests from the custom template, and refuses to move it with the moon", async () => {
    const shop = await restaurantShop(env, "growth");
    const add = (await req(env, shop.ownerToken, "POST", `${base(shop)}/occasions`, occasion)).body;
    const id = `custom-${add.id}`;
    const draft = await req(env, shop.ownerToken, "POST", `${base(shop)}/${id}/campaign-drafts`, { templateId: "message", channel: "email" });
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ festivalId: id, year: 2026, channel: "email", approximate: false });
    expect(draft.body.subject).toBe("Join us on Friday, November 20");
    expect(draft.body.body).toContain("Free chai all day");
    const test = await req(env, shop.ownerToken, "POST", `${base(shop)}/${id}/test-send`, { templateId: "message", channel: "email" });
    expect(test.status).toBe(200);
    expect(env.ctx.providers.outbox.email.at(-1)!.text).toContain("Friday, November 20");
    const up = await req(env, shop.ownerToken, "GET", `${base(shop)}/upcoming?days=60`);
    expect(up.body.items.find((i: { festivalId: string }) => i.festivalId === id).sendStatus).toEqual([expect.objectContaining({ templateId: "message", channel: "email", status: "draft" })]);
    expect((await req(env, shop.ownerToken, "PUT", `${base(shop)}/${id}/date-override`, { year: 2026, start: "2026-11-21" })).status).toBe(400);
  });

  it("validates, keeps each shop's dates private, removes a date, and is manager-only and tier-gated", async () => {
    const shop = await restaurantShop(env, "growth");
    expect((await req(env, shop.ownerToken, "POST", `${base(shop)}/occasions`, { ...occasion, name: "" })).status).toBe(400);
    expect((await req(env, shop.ownerToken, "POST", `${base(shop)}/occasions`, { ...occasion, date: "2026-10-01" })).status).toBe(400); // already passed
    expect((await req(env, shop.ownerToken, "POST", `${base(shop)}/occasions`, { ...occasion, date: "2031-01-01" })).status).toBe(400);
    expect((await req(env, null, "POST", `${base(shop)}/occasions`, occasion)).status).toBe(401);
    const starter = await restaurantShop(env, "starter");
    expect((await req(env, starter.ownerToken, "POST", `${base(starter)}/occasions`, occasion)).status).toBe(402);

    const add = (await req(env, shop.ownerToken, "POST", `${base(shop)}/occasions`, occasion)).body;
    const other = await restaurantShop(env, "growth");
    expect((await req(env, other.ownerToken, "GET", `${base(other)}/upcoming?days=60`)).body.items.some((i: { festivalId: string }) => i.festivalId.startsWith("custom-"))).toBe(false);
    expect((await req(env, other.ownerToken, "DELETE", `${base(other)}/occasions/${add.id}`)).status).toBe(404);
    expect((await req(env, other.ownerToken, "POST", `${base(other)}/custom-${add.id}/campaign-drafts`, { templateId: "message", channel: "email" })).status).toBe(404);
    expect((await req(env, shop.ownerToken, "DELETE", `${base(shop)}/occasions/${add.id}`)).body).toEqual({ ok: true });
    expect(await env.db.select().from(merchantOccasions).where(eq(merchantOccasions.merchantId, shop.merchant.id))).toHaveLength(0);
    expect((await req(env, shop.ownerToken, "GET", `${base(shop)}/upcoming?days=60`)).body.items.some((i: { festivalId: string }) => i.festivalId.startsWith("custom-"))).toBe(false);
  });
});
