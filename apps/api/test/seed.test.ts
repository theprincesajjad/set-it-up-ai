import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appointments,
  staffHours,
  staffServices,
  services as serviceRows,
  adCampaigns,
  adEvents,
  bookingSlots,
  bookings,
  catalogItems,
  discountCards,
  invoices,
  quotes,
  serviceTickets,
  cateringEvents,
  featureOverrides,
  halls,
  hallBookings,
  ledgerEntries,
  leads,
  merchantCategories,
  merchantMembers,
  merchantStaff,
  merchants,
  neighbourhoods,
  networkPerks,
  orderItems,
  orderSplits,
  orders,
  phoneCalls,
  promos,
  reviewRequests,
  tiffinDeliveries,
  tiffinMenus,
  tiffinPlans,
  tiffinRoutes,
  tiffinSkips,
  tiffinSubscriptions,
  users,
  visits,
  whatsappSessions,
  manualPayments,
  tiffinDriverLinks,
  tiffinCharges,
} from "@ll/db";
import { DEMO_CREDENTIALS, seedDemo } from "../src/seed.js";
import { ledgerBalance } from "../src/services/ledger.js";
import { createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
let result: Awaited<ReturnType<typeof seedDemo>>;
// One seeded DB for the whole file (seeding is the slow part); tests only read.
beforeAll(async () => {
  env = await createTestEnv({ now: new Date() });
  result = await seedDemo(env.db, { customers: 30, days: 45, config: env.ctx.config });
}, 120_000);
afterAll(async () => env.close());

describe("seedDemo", () => {
  it("creates the Toronto demo network", async () => {
    expect(result.skipped).toBe(false);
    const hoods = await env.db.select().from(neighbourhoods);
    expect(hoods.map((h) => h.slug).sort()).toEqual(["leslieville", "ridgeway-plaza", "roncesvalles", "the-danforth"]);
    expect(hoods.find((h) => h.slug === "roncesvalles")!.status).toBe("pilot");
    const ms = await env.db.select().from(merchants);
    expect(ms.length).toBeGreaterThanOrEqual(25);
    const verticals = new Set(ms.map((m) => m.vertical));
    for (const v of ["cafe", "bakery", "pharmacy", "repair_electronics", "repair_auto", "salon", "barber", "florist", "bookstore", "pet", "restaurant", "dry_cleaning"]) expect(verticals).toContain(v);
    expect(ms.every((m) => m.slug && m.description)).toBe(true);
    expect(ms.filter((m) => m.repUserId).length).toBeGreaterThan(5);
    const [perk] = await env.db.select().from(networkPerks).where(eq(networkPerks.name, "Roncy Explorer"));
    expect(perk).toMatchObject({ threshold: 3, bonusPoints: 50 });
    expect((await env.db.select().from(promos)).length).toBeGreaterThanOrEqual(5);
    expect((await env.db.select().from(leads)).length).toBe(result.leads);
    expect(result.visits).toBeGreaterThan(30);
  });

  it("Pricing v2: pilot shops show promos via admin overrides; other shops' promos stay hidden", async () => {
    expect(result.pilotOverrides.map((p) => p.slug)).toEqual(["pinecone-coffee", "hearth-and-crumb", "village-apothecary"]);
    const page = (slug: string) => env.app.inject({ method: "GET", url: `/v1/public/shops/${slug}` }).then((r) => r.json());
    const cafe = await page("pinecone-coffee");
    expect(cafe.features).toMatchObject({ promos: true, discountCards: true });
    expect(cafe.promos.map((p: { title: string }) => p.title)).toContain("Two-stamp Tuesdays");
    // Nonna's has a scheduled event promo in the DB, but it isn't a pilot: hidden.
    const nonnas = await page("nonnas-table");
    expect(nonnas.features.promos).toBe(false);
    expect(nonnas.promos).toEqual([]);
  });

  it("pharmacy prescriptions are no-earn", async () => {
    const [pharmacy] = await env.db.select().from(merchants).where(eq(merchants.slug, "village-apothecary"));
    const cats = await env.db.select().from(merchantCategories).where(eq(merchantCategories.merchantId, pharmacy!.id));
    expect(cats.find((c) => c.name === "Prescriptions")).toMatchObject({ earnEligible: false, discountEligible: false });
  });

  it("keeps the ledger valid: entries sum to zero and cached balances match", async () => {
    const [sum] = await env.db.select({ s: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)::int` }).from(ledgerEntries);
    expect(Number(sum!.s)).toBe(0);
    const members = await env.db.select().from(merchantMembers);
    expect(members.length).toBeGreaterThan(20);
    for (const m of members) expect(await ledgerBalance(env.db, m.id)).toBe(m.balance);
    // Some members hold 2+ shops (network effect).
    const [multi] = await env.db.select({ n: sql<number>`count(*)::int` }).from(sql`(select user_id from merchant_members group by user_id having count(*) >= 2) t`);
    expect(Number(multi!.n)).toBeGreaterThan(0);
  });

  it("back-dates history across the window", async () => {
    const [range] = await env.db.select({ min: sql<Date>`min(${visits.createdAt})`, max: sql<Date>`max(${visits.createdAt})` }).from(visits);
    const spanDays = (new Date(range!.max).getTime() - new Date(range!.min).getTime()) / 86400000;
    expect(spanDays).toBeGreaterThan(20);
  });

  it("demo admin can sign in and is an admin", async () => {
    const [admin] = await env.db.select().from(users).where(eq(users.email, DEMO_CREDENTIALS.admin.email));
    expect(admin!.platformRole).toBe("admin");
    const r = await env.app.inject({ method: "POST", url: "/v1/auth/login", payload: DEMO_CREDENTIALS.admin });
    expect(r.statusCode).toBe(200);
    const owner = await env.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: DEMO_CREDENTIALS.ownerEmail("pinecone-coffee"), password: DEMO_CREDENTIALS.ownerPassword } });
    expect(owner.statusCode).toBe(200);
    expect(result.credentials.find((c) => c.role === "rep")!.email).toBe(DEMO_CREDENTIALS.rep.email);
  });

  it("is idempotent (second run skips)", async () => {
    const before = await env.db.select({ n: sql<number>`count(*)::int` }).from(merchants);
    const again = await seedDemo(env.db, { customers: 5 });
    expect(again.skipped).toBe(true);
    const after = await env.db.select({ n: sql<number>`count(*)::int` }).from(merchants);
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});

const slugToId = async (slug: string) => (await env.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, slug)))[0]!.id;

describe("core modules on the pilot shops", () => {
  const count = async (table: Parameters<typeof env.db.select>[0] extends never ? never : any, where: any) => Number((await env.db.select({ n: sql<number>`count(*)::int` }).from(table).where(where))[0]!.n);

  it("promos on the pilot shops cover live, scheduled and ended", async () => {
    for (const slug of ["pinecone-coffee", "hearth-and-crumb"]) {
      const rows = await env.db.select().from(promos).where(eq(promos.merchantId, await slugToId(slug)));
      expect(new Set(rows.map((p) => p.status))).toEqual(new Set(["live", "scheduled", "ended"]));
    }
    const [ended] = await env.db.select().from(promos).where(eq(promos.title, "Holiday stamp bonus"));
    expect(ended!.claimCount).toBeGreaterThan(0);
  });

  it("discount cards, catalog categories and orders in every status", async () => {
    expect(await count(discountCards, eq(discountCards.merchantId, await slugToId("pinecone-coffee")))).toBeGreaterThanOrEqual(2);
    expect(await count(discountCards, eq(discountCards.merchantId, await slugToId("hearth-and-crumb")))).toBeGreaterThanOrEqual(1);
    for (const slug of ["pinecone-coffee", "hearth-and-crumb", "fix-it-phone-lab"]) {
      const items = await env.db.select().from(catalogItems).where(eq(catalogItems.merchantId, await slugToId(slug)));
      expect(items.length).toBeGreaterThanOrEqual(7);
      expect(items.every((i) => i.categoryId)).toBe(true);
    }
    const os = await env.db.select().from(orders).where(eq(orders.merchantId, await slugToId("pinecone-coffee")));
    expect(new Set(os.map((o) => o.status))).toEqual(new Set(["pending", "accepted", "preparing", "ready", "picked_up", "cancelled"]));
    // History is back-dated across the week, nothing is created in the future.
    expect(Math.max(...os.map((o) => o.createdAt.getTime()))).toBeLessThanOrEqual(Date.now());
    expect(Date.now() - Math.min(...os.map((o) => o.createdAt.getTime()))).toBeGreaterThan(4 * 86400000);
  });

  it("slots for the next week with bookings (pickup and drop-off)", async () => {
    for (const [slug, kind] of [["pinecone-coffee", "pickup"], ["hearth-and-crumb", "pickup"], ["fix-it-phone-lab", "dropoff"]] as const) {
      const id = await slugToId(slug);
      const slots = await env.db.select().from(bookingSlots).where(and(eq(bookingSlots.merchantId, id), eq(bookingSlots.kind, kind)));
      expect(slots.length).toBeGreaterThan(50);
      expect(Math.max(...slots.map((s) => s.startsAt.getTime()))).toBeGreaterThan(Date.now() + 5 * 86400000);
      expect(await count(bookings, and(eq(bookings.merchantId, id), eq(bookings.status, "booked")))).toBeGreaterThanOrEqual(3);
    }
  });

  it("repair shop tickets span every status with quotes and invoices", async () => {
    const id = await slugToId("fix-it-phone-lab");
    const ts = await env.db.select().from(serviceTickets).where(eq(serviceTickets.merchantId, id));
    expect(new Set(ts.map((t) => t.status))).toEqual(new Set(["intake", "diagnosing", "quote_sent", "approved", "declined", "in_progress", "waiting_parts", "ready", "picked_up", "cancelled"]));
    expect(Math.max(...ts.map((t) => t.createdAt.getTime()))).toBeLessThanOrEqual(Date.now());
    const qs = await env.db.select().from(quotes).where(eq(quotes.merchantId, id));
    expect(new Set(qs.map((q) => q.status))).toEqual(new Set(["sent", "approved", "declined"]));
    const inv = await env.db.select().from(invoices).where(eq(invoices.merchantId, id));
    expect(new Set(inv.map((i) => i.status))).toEqual(new Set(["open", "paid"]));
  });

  it("hearth & crumb runs a draft, a live and an ended ad with delivery numbers", async () => {
    const ads = await env.db.select().from(adCampaigns).where(eq(adCampaigns.merchantId, await slugToId("hearth-and-crumb")));
    expect(ads.map((a) => a.status).sort()).toEqual(["active", "draft", "ended"]);
    for (const a of ads.filter((x) => x.status !== "draft")) {
      expect(a.impressions).toBeGreaterThan(50);
      expect(a.clicks).toBeGreaterThan(0);
      expect(await count(adEvents, eq(adEvents.adCampaignId, a.id))).toBeGreaterThan(50);
    }
  });

  it("owners of the shops see the modules through the API", async () => {
    const login = await env.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: DEMO_CREDENTIALS.ownerEmail("fix-it-phone-lab"), password: DEMO_CREDENTIALS.ownerPassword } });
    const headers = { authorization: `Bearer ${login.json().accessToken}` };
    const id = await slugToId("fix-it-phone-lab");
    const list = await env.app.inject({ method: "GET", url: `/v1/merchants/${id}/tickets?limit=100`, headers });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBeGreaterThanOrEqual(7);
    const bk = await env.app.inject({ method: "GET", url: `/v1/merchants/${id}/bookings?kind=dropoff`, headers });
    expect(bk.json().items[0]).toMatchObject({ customerName: expect.any(String) });
  });
});

describe("Ridgeway Plaza restaurant corridor", () => {
  it("creates the Mississauga corridor with every restaurant tier", async () => {
    const [hood] = await env.db.select().from(neighbourhoods).where(eq(neighbourhoods.slug, "ridgeway-plaza"));
    expect(hood).toMatchObject({ city: "Mississauga", province: "ON", status: "pilot" });
    const shops = await env.db.select().from(merchants).where(eq(merchants.neighbourhoodId, hood!.id));
    expect(shops.length).toBe(10);
    const tier = (slug: string) => shops.find((m) => m.slug === slug)!.restaurantTier;
    expect(tier("nawab-biryani-house")).toBe("pro");
    for (const s of ["lahori-karahi-and-bbq", "shree-thali-and-tiffin", "zeenat-catering"]) expect(tier(s)).toBe("growth");
    for (const s of ["sarson-dhaba", "meethi-mithai-and-chai", "padma-bangladeshi-kitchen", "jaffna-kottu-house", "kabul-garden-grill"]) expect(tier(s)).toBe("starter");
    expect(tier("rangrez-beauty-studio")).toBeNull();
    expect(shops.find((m) => m.slug === "rangrez-beauty-studio")!.vertical).toBe("salon");
    expect(shops.filter((m) => m.foundingOffer).map((m) => m.slug).sort()).toEqual(["meethi-mithai-and-chai", "nawab-biryani-house", "shree-thali-and-tiffin"]);
    expect(shops.every((m) => m.languages.length >= 1 && m.status === "active")).toBe(true);
    expect(shops.find((m) => m.slug === "nawab-biryani-house")).toMatchObject({ cashDiscountBps: 300, whatsappNumber: expect.any(String) });
    expect(shops.filter((m) => m.whatsappNumber).map((m) => m.slug).sort()).toEqual(["lahori-karahi-and-bbq", "nawab-biryani-house"]);
    expect(shops.find((m) => m.slug === "lahori-karahi-and-bbq")!.preorderDailyCap).toBe(12);
    const [perk] = await env.db.select().from(networkPerks).where(eq(networkPerks.neighbourhoodId, hood!.id));
    expect(perk).toMatchObject({ threshold: 3, bonusPoints: 50 });
    expect(result.corridor).toMatchObject({ merchants: 10 });
    expect(result.credentials.some((c) => c.email === DEMO_CREDENTIALS.ownerEmail("nawab-biryani-house"))).toBe(true);
  });

  it("owner can sign in to the Pro biryani house and its public page loads", async () => {
    const r = await env.app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: DEMO_CREDENTIALS.ownerEmail("nawab-biryani-house"), password: DEMO_CREDENTIALS.ownerPassword } });
    expect(r.statusCode).toBe(200);
    const page = await env.app.inject({ method: "GET", url: "/v1/public/shops/nawab-biryani-house" });
    expect(page.statusCode).toBe(200);
    expect(JSON.stringify(page.json())).toContain("Nawab Biryani House");
  });

  it("menus carry halal claims with a certifier, dietary tags and accurate translations", async () => {
    const nawab = await slugToId("nawab-biryani-house");
    const items = await env.db.select().from(catalogItems).where(eq(catalogItems.merchantId, nawab));
    expect(items.length).toBeGreaterThanOrEqual(15);
    // The certifier is the shop's, stated once; a dish only carries its own when it differs.
    const [shop] = await env.db.select().from(merchants).where(eq(merchants.id, nawab));
    expect(shop!.halalCertification).toMatchObject({ certifier: "Crescent Halal Council", scope: "all_meat" });
    for (const i of items) {
      expect(i.dietary).toMatchObject({ halal: true, zabihah: true });
      expect(i.translations.hi?.name && i.translations.ur?.name && i.translations.pa?.name).toBeTruthy();
    }
    const biryani = items.find((i) => i.name === "Hyderabadi Chicken Dum Biryani")!;
    expect(biryani.translations.pa!.name).toBe("ਹੈਦਰਾਬਾਦੀ ਚਿਕਨ ਦਮ ਬਿਰਯਾਨੀ");
    expect(biryani.translations.ur!.name).toMatch(/[\u0600-\u06FF]/);
    expect(biryani.translations.hi!.name).toMatch(/[\u0900-\u097F]/);
    expect(biryani.station).toBe("rice");
    expect(new Set(items.map((i) => i.station).filter(Boolean))).toEqual(new Set(["tandoor", "curry", "rice"]));
    const degh = items.filter((i) => i.preorderOnly);
    expect(degh.length).toBe(3);
    expect(degh.every((i) => i.serves === 15 && i.depositBps === 3000 && i.leadTimeHours >= 24)).toBe(true);

    const dhaba = await slugToId("sarson-dhaba");
    const dhabaItems = await env.db.select().from(catalogItems).where(eq(catalogItems.merchantId, dhaba));
    for (const i of dhabaItems) expect(i.translations.pa?.name && i.translations.hi?.name && i.translations.ur?.name).toBeTruthy();
    expect(dhabaItems.find((i) => i.name === "Dal Makhani")!.translations.pa!.name).toBe("ਦਾਲ ਮੱਖਣੀ");
    expect(dhabaItems.some((i) => i.dietary.vegan)).toBe(true);
    expect(dhabaItems.some((i) => i.dietary.vegetarian)).toBe(true);
    expect(dhabaItems.some((i) => i.dietary.halal)).toBe(false); // never claimed on the shop's behalf
    expect(dhabaItems.every((i) => i.priceCents >= 199 && i.priceCents <= 3000)).toBe(true);

    const thali = await env.db.select().from(catalogItems).where(eq(catalogItems.merchantId, await slugToId("shree-thali-and-tiffin")));
    expect(thali.some((i) => i.dietary.jain)).toBe(true);
    const mithai = await env.db.select().from(catalogItems).where(and(eq(catalogItems.merchantId, await slugToId("meethi-mithai-and-chai")), eq(catalogItems.preorderOnly, true)));
    expect(mithai.map((i) => i.name).join("|")).toMatch(/Diwali[\s\S]*Eid|Eid[\s\S]*Diwali/);
  });

  it("staff have locales and stations", async () => {
    const nawab = await slugToId("nawab-biryani-house");
    const staff = await env.db.select().from(merchantStaff).where(eq(merchantStaff.merchantId, nawab));
    expect(staff.find((s) => s.station === "tandoor")!.locale).toBe("pa");
    expect(staff.find((s) => s.role === "manager")!.locale).toBe("ur");
    expect(new Set(staff.map((s) => s.station).filter(Boolean))).toEqual(new Set(["tandoor", "curry", "rice"]));
  });

  it("orders of every kind exist across 30 days, with open kitchen tickets, a cash discount and split bills", async () => {
    const ms = await env.db.select({ id: merchants.id }).from(merchants).where(inArray(merchants.slug, ["nawab-biryani-house", "lahori-karahi-and-bbq", "shree-thali-and-tiffin", "sarson-dhaba", "meethi-mithai-and-chai", "zeenat-catering"]));
    const rows = await env.db.select().from(orders).where(inArray(orders.merchantId, ms.map((m) => m.id)));
    expect(new Set(rows.map((o) => o.kind))).toEqual(new Set(["pickup", "preorder", "tiffin", "catering", "banquet"]));
    expect(new Set(rows.map((o) => o.channel))).toEqual(new Set(["app", "web", "counter", "whatsapp", "phone"]));
    const oldest = Math.min(...rows.map((o) => o.createdAt.getTime()));
    expect((Date.now() - oldest) / 86400000).toBeGreaterThan(20);
    expect(Date.now() - Math.max(...rows.map((o) => o.createdAt.getTime()))).toBeLessThan(2 * 3600_000);
    expect(rows.some((o) => o.kind === "preorder" && o.depositCents > 0 && o.depositPaidAt)).toBe(true);
    expect(rows.every((o) => o.totalCents === o.subtotalCents - o.discountCents - o.cashDiscountCents + o.taxCents + o.tipCents + o.customerFeeCents)).toBe(true);
    const nawab = await slugToId("nawab-biryani-house");
    const cash = rows.filter((o) => o.merchantId === nawab && o.cashDiscountCents > 0);
    expect(cash.length).toBeGreaterThan(0);
    expect(cash.every((o) => o.channel === "counter")).toBe(true);
    const open = rows.filter((o) => o.merchantId === nawab && ["accepted", "preparing", "ready"].includes(o.status) && o.firedAt && !o.bumpedAt && o.kind === "pickup");
    expect(open.length).toBeGreaterThanOrEqual(6);
    const openItems = await env.db.select().from(orderItems).where(inArray(orderItems.orderId, open.map((o) => o.id)));
    expect(new Set(openItems.map((i) => i.station))).toEqual(new Set(["tandoor", "curry", "rice", null]));
    expect(new Set(openItems.map((i) => i.kitchenStatus))).toEqual(new Set(["queued", "cooking", "ready"]));
    const splits = await env.db.select().from(orderSplits);
    expect(splits.length).toBe(3);
    expect(splits.reduce((s, x) => s + x.amountCents, 0)).toBe(open.find((o) => o.id === splits[0]!.orderId)!.totalCents);
    expect(new Set(splits.map((x) => x.status))).toEqual(new Set(["paid", "open"]));
    const numbers = rows.filter((o) => o.merchantId === nawab).map((o) => o.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("Zeenat caters seven events across statuses, including a confirmed walima for 300 and a quoted mehndi", async () => {
    const z = await slugToId("zeenat-catering");
    const evs = await env.db.select().from(cateringEvents).where(eq(cateringEvents.merchantId, z));
    expect(evs.length).toBe(7);
    expect(new Set(evs.map((e) => e.status))).toEqual(new Set(["confirmed", "quoted", "inquiry", "tasting", "completed", "cancelled"]));
    const walima = evs.find((e) => e.eventType === "walima")!;
    expect(walima).toMatchObject({ headcount: 300, status: "confirmed" });
    expect(walima.depositPaidAt).not.toBeNull();
    expect(walima.depositCents).toBe(Math.round((walima.totalCents * walima.depositBps) / 10000));
    expect(walima.approvedAt && walima.signatureName).toBeTruthy();
    const mehndi = evs.find((e) => e.eventType === "mehndi")!;
    expect(mehndi).toMatchObject({ status: "quoted", depositPaidAt: null });
    expect(mehndi.quoteSentAt).not.toBeNull();
    expect(new Set(evs.map((e) => e.approvalToken)).size).toBe(7);
    // Hand-recorded money: the walima deposit came by e-transfer (ledger row, method and date), with a 10% taxed service charge;
    // one quote was sent days ago and not opened; another is approved and waiting for an e-transfer.
    expect(walima).toMatchObject({ depositMethod: "etransfer", serviceChargeBps: 1000 });
    expect(walima.referenceCode).toMatch(/^[A-Z]{2}-\d{4}$/);
    const ledger = await env.db.select().from(manualPayments).where(eq(manualPayments.merchantId, z));
    expect(ledger.filter((l) => l.subjectType === "catering_deposit").map((l) => l.method)).toEqual(["etransfer", "etransfer"]);
    expect(ledger.some((l) => l.subjectType === "catering_balance" && l.method === "cheque")).toBe(true);
    expect(mehndi.quoteOpenedAt).toBeNull();
    expect(evs.some((e) => e.status === "quoted" && e.approvedAt && !e.depositPaidAt)).toBe(true);
    // Catering-only shop: no counter menu orders other than catering trays.
    const zOrders = await env.db.select().from(orders).where(eq(orders.merchantId, z));
    expect(zOrders.every((o) => o.kind === "catering")).toBe(true);
  });

  it("Noor Hall seats 250 with packages and a linked banquet booking", async () => {
    const nawab = await slugToId("nawab-biryani-house");
    const [hall] = await env.db.select().from(halls).where(eq(halls.merchantId, nawab));
    expect(hall).toMatchObject({ name: "Noor Hall", capacity: 250 });
    expect(hall!.packages.map((p) => p.name)).toEqual(["Silver", "Gold", "Platinum"]);
    const bookings = await env.db.select().from(hallBookings).where(eq(hallBookings.hallId, hall!.id));
    expect(new Set(bookings.map((b) => b.status))).toEqual(new Set(["confirmed", "hold", "completed", "cancelled"]));
    const confirmed = bookings.find((b) => b.status === "confirmed")!;
    const [ev] = await env.db.select().from(cateringEvents).where(eq(cateringEvents.hallBookingId, confirmed.id));
    expect(ev).toMatchObject({ service: "banquet", headcount: 220 });
    expect(confirmed.cateringEventId).toBe(ev!.id);
    expect(bookings.every((b) => b.headcount <= hall!.capacity)).toBe(true);
  });

  it("Shree runs three tiffin plans, two routes, ~25 subscribers and today's deliveries", async () => {
    const shree = await slugToId("shree-thali-and-tiffin");
    const plans = await env.db.select().from(tiffinPlans).where(eq(tiffinPlans.merchantId, shree));
    expect(plans.map((p) => p.cadence).sort()).toEqual(["monthly", "monthly", "weekly"]);
    const routes = await env.db.select().from(tiffinRoutes).where(eq(tiffinRoutes.merchantId, shree));
    expect(routes.length).toBe(2);
    expect(new Set(routes.flatMap((r) => r.areas))).toEqual(new Set(["L5R", "L5V", "L4Z"]));
    const subs = await env.db.select().from(tiffinSubscriptions).where(eq(tiffinSubscriptions.merchantId, shree));
    expect(subs.length).toBe(25);
    expect(new Set(subs.map((s) => s.status))).toEqual(new Set(["active", "paused", "past_due", "pending", "cancelled"]));
    expect(subs.filter((s) => s.status === "past_due").length).toBe(1);
    expect(subs.filter((s) => s.status === "paused").every((s) => s.pausedUntil)).toBe(true);
    for (const sub of subs.filter((s) => s.fulfilment === "delivery")) {
      const route = routes.find((r) => r.id === sub.routeId)!;
      expect(route.areas).toContain(sub.postalCode!.slice(0, 3));
    }
    const menus = await env.db.select().from(tiffinMenus).where(eq(tiffinMenus.merchantId, shree));
    const dates = [...new Set(menus.map((m) => m.date))].sort();
    expect(dates.length).toBeGreaterThanOrEqual(13);
    expect(Date.parse(dates[dates.length - 1]!) - Date.parse(dates[0]!)).toBeLessThanOrEqual(13 * 86400000);
    const skips = await env.db.select().from(tiffinSkips);
    expect(skips.length).toBeGreaterThan(3);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    const todays = await env.db.select().from(tiffinDeliveries).where(and(eq(tiffinDeliveries.merchantId, shree), eq(tiffinDeliveries.date, today)));
    expect(todays.length).toBeGreaterThan(5);
    expect(todays.every((d) => d.routeId || subs.find((s) => s.id === d.subscriptionId)!.fulfilment === "pickup")).toBe(true);
    // E-transfer subscribers: some recorded (ledger row, reference, no platform fee), some awaiting; a driver link for Route A today.
    const charges = await env.db.select().from(tiffinCharges).where(eq(tiffinCharges.merchantId, shree));
    const byHand = charges.filter((c) => c.paymentMethod === "etransfer" || c.paymentMethod === "cash");
    expect(byHand.length).toBeGreaterThanOrEqual(6);
    expect(byHand.every((c) => c.referenceCode && c.platformFeeCents === 0)).toBe(true);
    expect(byHand.filter((c) => c.status === "awaiting").length).toBe(3);
    const ledger = await env.db.select().from(manualPayments).where(eq(manualPayments.merchantId, shree));
    expect(ledger.length).toBe(byHand.filter((c) => c.status === "paid").length);
    expect(new Set(byHand.map((c) => c.referenceCode)).size).toBe(byHand.length);
    const [link] = await env.db.select().from(tiffinDriverLinks).where(eq(tiffinDriverLinks.merchantId, shree));
    expect(link).toMatchObject({ date: routes.length ? link!.date : "", token: expect.stringMatching(/^drv-/) });
    expect(routes.some((r) => r.id === link!.routeId)).toBe(true);
  });

  it("every restaurant-tier shop can take payments locally; Shree's tiffin plans and menus speak hi, ur and pa", async () => {
    const tiered = await env.db.select().from(merchants).where(sql`${merchants.restaurantTier} is not null`);
    expect(tiered.length).toBeGreaterThanOrEqual(8);
    for (const m of tiered) {
      expect(m).toMatchObject({ stripeChargesEnabled: true, stripePayoutsEnabled: true, stripeDetailsSubmitted: true });
      expect(m.stripeAccountId).toMatch(/^acct_demo_/);
      const [ov] = await env.db.select().from(featureOverrides).where(and(eq(featureOverrides.merchantId, m.id), eq(featureOverrides.key, "payments.in_app")));
      expect(ov?.enabled).toBe(true);
    }
    const shree = await slugToId("shree-thali-and-tiffin");
    const plans = await env.db.select().from(tiffinPlans).where(eq(tiffinPlans.merchantId, shree));
    for (const p of plans) {
      expect(p.translations.hi?.name).toMatch(/[\u0900-\u097F]/);
      expect(p.translations.ur?.name).toMatch(/[\u0600-\u06FF]/);
      expect(p.translations.pa?.name).toMatch(/[\u0A00-\u0A7F]/);
      expect(p.translations.ur?.description && p.translations.pa?.description).toBeTruthy();
    }
    const menus = await env.db.select().from(tiffinMenus).where(eq(tiffinMenus.merchantId, shree));
    expect(menus.length).toBeGreaterThanOrEqual(30);
    for (const it of menus.flatMap((m) => m.items)) expect(it.translations?.hi?.name && it.translations?.ur?.name && it.translations?.pa?.name).toBeTruthy();
  });

  it("seeds two unanswered demo review links for Sarson Dhaba (used by the e2e spec)", async () => {
    const sarson = await slugToId("sarson-dhaba");
    const rows = await env.db.select().from(reviewRequests).where(and(eq(reviewRequests.merchantId, sarson), inArray(reviewRequests.token, ["demo-review-sarson-5", "demo-review-sarson-low"])));
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.rating === null)).toBe(true);
  });

  it("has WhatsApp sessions with opt-ins, phone calls with transcripts and drafts, and rated review requests", async () => {
    const nawab = await slugToId("nawab-biryani-house");
    const lahori = await slugToId("lahori-karahi-and-bbq");
    for (const m of [nawab, lahori]) {
      const sessions = await env.db.select().from(whatsappSessions).where(eq(whatsappSessions.merchantId, m));
      expect(sessions.length).toBeGreaterThanOrEqual(5);
      expect(sessions.some((s) => s.marketingOptInAt)).toBe(true);
      expect(sessions.some((s) => s.state === "cart" || s.state === "checkout")).toBe(true);
    }
    const calls = await env.db.select().from(phoneCalls).where(eq(phoneCalls.merchantId, nawab));
    expect(new Set(calls.map((c) => c.language))).toEqual(new Set(["ur", "hi", "en", "pa"]));
    expect(new Set(calls.map((c) => c.status))).toEqual(new Set(["confirmed", "drafted", "failed", "received"]));
    expect(calls.every((c) => c.transcript)).toBe(true);
    expect(calls.filter((c) => c.status === "drafted").every((c) => c.draftOrder && c.draftOrder.items.length > 0)).toBe(true);
    for (const c of calls.filter((x) => x.status === "confirmed")) expect(c.orderId).not.toBeNull();
    const dhaba = await slugToId("sarson-dhaba");
    const reviews = await env.db.select().from(reviewRequests).where(eq(reviewRequests.merchantId, dhaba));
    expect(reviews.length).toBeGreaterThanOrEqual(8);
    expect(reviews.filter((r) => r.rating !== null).every((r) => r.rating! >= 1 && r.rating! <= 5)).toBe(true);
    expect(reviews.some((r) => r.rating !== null && r.rating >= 4)).toBe(true);
  });

  it("loyalty programs, members and visits exist and balances come from the ledger", async () => {
    const [hood] = await env.db.select().from(neighbourhoods).where(eq(neighbourhoods.slug, "ridgeway-plaza"));
    const shops = await env.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.neighbourhoodId, hood!.id));
    const members = await env.db.select().from(merchantMembers).where(inArray(merchantMembers.merchantId, shops.map((s) => s.id)));
    expect(members.length).toBeGreaterThan(50);
    for (const m of members.slice(0, 40)) expect(await ledgerBalance(env.db, m.id)).toBe(m.balance);
    const v = await env.db.select({ n: sql<number>`count(*)::int` }).from(visits).where(inArray(visits.merchantId, shops.map((s) => s.id)));
    expect(Number(v[0]!.n)).toBeGreaterThan(80);
    const salon = await slugToId("rangrez-beauty-studio");
    expect(members.some((m) => m.merchantId === salon)).toBe(true);
  });
});

describe("seedDemo: appointment salons", () => {
  const slugId = async (slug: string) => (await env.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, slug)))[0]!.id;

  it("seeds Bloom Hair Studio with three stylists, six services and a day with visits in every state", async () => {
    const bloom = await slugId("bloom-hair-studio");
    const svc = await env.db.select().from(serviceRows).where(eq(serviceRows.merchantId, bloom));
    expect(svc).toHaveLength(6);
    expect(svc.find((s) => s.name.startsWith("Highlights"))).toMatchObject({ priceFrom: true, depositCents: 4000, durationMin: 120 });
    const hours = await env.db.select().from(staffHours).where(eq(staffHours.merchantId, bloom));
    expect(new Set(hours.map((h) => h.userId)).size).toBe(3);
    const overrides = await env.db.select().from(featureOverrides).where(and(eq(featureOverrides.merchantId, bloom), eq(featureOverrides.key, "booking.appointments")));
    expect(overrides[0]!.enabled).toBe(true);
    const [shop] = await env.db.select().from(merchants).where(eq(merchants.id, bloom));
    expect(shop).toMatchObject({ noShowFeeCents: 2500, cancelWindowHours: 24 });
    const visits = await env.db.select().from(appointments).where(eq(appointments.merchantId, bloom));
    expect(visits.length).toBeGreaterThan(20);
    expect(new Set(visits.map((v) => v.status)).has("completed")).toBe(true);
    // Past visits went through checkout: an invoice, a tip to the stylist, points earned.
    const inv = await env.db.select().from(invoices).where(and(eq(invoices.merchantId, bloom), sql`${invoices.appointmentId} is not null`));
    expect(inv.length).toBeGreaterThan(5);
    expect(inv.every((i) => i.status === "paid" && i.tipStaffId && i.tipCents > 0)).toBe(true);
    expect(inv.some((i) => i.pointsEarned > 0)).toBe(true);
    // Nobody has two overlapping active visits (the database would have refused).
    const active = visits.filter((v) => ["booked", "arrived", "in_service"].includes(v.status) && v.staffId).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (const [i, v] of active.entries()) {
      const next = active.slice(i + 1).find((o) => o.staffId === v.staffId);
      if (next) expect(next.startsAt.getTime()).toBeGreaterThanOrEqual(v.endsAt.getTime());
    }
  });

  it("seeds Rangrez Beauty Studio with threading, henna and bridal in four languages, and a bridal group", async () => {
    const rangrez = await slugId("rangrez-beauty-studio");
    const svc = await env.db.select().from(serviceRows).where(eq(serviceRows.merchantId, rangrez));
    expect(svc.map((s) => s.name)).toEqual(expect.arrayContaining(["Eyebrow threading", "Henna, both hands", "Bridal henna, full", "Bridal makeup and hair"]));
    expect(svc.find((s) => s.name === "Eyebrow threading")!.translations).toMatchObject({ hi: { name: "आइब्रो थ्रेडिंग" }, ur: { name: "آئی برو تھریڈنگ" }, pa: { name: "ਆਈਬ੍ਰੋ ਥ੍ਰੈਡਿੰਗ" } });
    const assigned = await env.db.select().from(staffServices).where(eq(staffServices.merchantId, rangrez));
    expect(assigned.length).toBeGreaterThan(5);
    const visits = await env.db.select().from(appointments).where(eq(appointments.merchantId, rangrez));
    const groups = visits.filter((v) => v.groupId);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.groupId)).size).toBe(1);
    expect(groups.every((g) => g.depositCents > 0 && g.depositPaidAt)).toBe(true);
  });

  it("is idempotent: seeding again adds nothing", async () => {
    const before = await env.db.select({ n: sql<number>`count(*)::int` }).from(appointments);
    await seedDemo(env.db, { customers: 30, days: 45, config: env.ctx.config });
    const after = await env.db.select({ n: sql<number>`count(*)::int` }).from(appointments);
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});
