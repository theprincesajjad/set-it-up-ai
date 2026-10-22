import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { messages } from "@ll/db";
import { FESTIVALS, FESTIVAL_YEARS, addDays, daysBetween, festivalOccurrences, formatFestivalDate, getFestival } from "@ll/shared";
import { createTestEnv, type TestEnv } from "./helpers.js";
import { req, restaurantShop } from "./restaurant-msg-fixtures.js";

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
