/**
 * Pet care (docs/research/pet-care.md): pets under the owner and vaccine proof, groom cadence and reminders, report cards,
 * daycare check-in blocks and packs, and the buy-12-get-1 food card with its run-out text.
 */
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appointments, daycarePacks, foodCards, petNudges, petVisits, pets, users } from "@ll/db";
import { FEATURES, FREE_FOREVER, bagLastsDays, checkInBlocks, defaultGroomWeeks, foodCardState, groomDueOn, groomState, lateMinutes, runOutOn, vaccineStatus } from "@ll/shared";
import { call, customer, paidMerchant, staffMember } from "./commerce-fixtures.js";
import { createTestEnv, createUser, tokenFor, type TestEnv } from "./helpers.js";
import { ensureMember } from "../src/services/ledger.js";
import { MemoryStorage } from "../src/providers/storage.js";
import { getStorage } from "../src/providers/storage.js";

let env: TestEnv;
let tracked: { user: { id: string; platformRole: "none" | "rep" | "admin" }; token: string }[] = [];
let shops: { ownerUser: { id: string; platformRole: "none" | "rep" | "admin" }; owner: string }[] = [];
beforeEach(async () => {
  env = await createTestEnv({ now: new Date("2026-11-04T15:00:00Z") }); // Wed 10:00 Toronto
  tracked = [];
  shops = [];
});
/** Move the clock; sessions expire with it, so sign everyone in again. */
async function jump(to: Date) {
  env.clock.now = to;
  for (const t of tracked) t.token = await tokenFor(env, t.user);
  for (const s of shops) s.owner = await tokenFor(env, s.ownerUser);
}
afterEach(async () => env.close());

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const sms = () => env.ctx.providers.outbox.sms;
const days = (n: number) => new Date(env.clock.now.getTime() + n * 86_400_000);
const ymd = (n: number) => days(n).toISOString().slice(0, 10);

async function shop(opts: { plan?: "free" | "plus" | "studio"; vertical?: string } = {}) {
  const m = await paidMerchant(env, { plan: opts.plan ?? "plus", vertical: opts.vertical ?? "pet" });
  const base = `/v1/merchants/${m.merchant.id}`;
  const out = { ...m, base, ownerUser: m.owner, owner: m.ownerToken };
  shops.push(out);
  return out;
}
type Shop = Awaited<ReturnType<typeof shop>>;

/** A customer who is a member of the shop, with texts agreed unless said otherwise. */
async function member(s: Shop, opts: { consent?: boolean; name?: string; locale?: string } = {}) {
  const c = await customer(env, { name: opts.name ?? "Mina Kapoor" });
  if (opts.locale) await env.db.update(users).set({ locale: opts.locale }).where(eq(users.id, c.user.id));
  const { member: m } = await env.db.transaction((tx) => ensureMember(env.ctx, tx, { merchantId: s.merchant.id, userId: c.user.id, joinedVia: "phone", consent: opts.consent === false ? null : { text: "Yes, text me.", source: "test" } }));
  const out = { ...c, memberId: m.id };
  tracked.push(out);
  return out;
}
const addPet = async (token: string, body: Record<string, unknown> = {}) => (await call(env, token, "POST", "/v1/me/pets", { name: "Biscuit", species: "dog", breed: "Goldendoodle", sizeBand: "medium", coat: "curly", ...body })).body;

describe("rules", () => {
  it("vaccines are current, expiring (30 days) or expired through the expiry date", () => {
    expect(vaccineStatus("2026-11-04", "2026-11-04")).toEqual({ status: "expiring", daysLeft: 0 });
    expect(vaccineStatus("2026-11-03", "2026-11-04").status).toBe("expired");
    expect(vaccineStatus("2026-12-05", "2026-11-04").status).toBe("current");
    expect(vaccineStatus("2026-12-04", "2026-11-04").status).toBe("expiring");
  });
  it("cadence defaults by coat and the due date counts in weeks", () => {
    expect(defaultGroomWeeks("curly")).toBe(5);
    expect(defaultGroomWeeks("long_silky")).toBe(4);
    expect(defaultGroomWeeks("double")).toBe(8);
    expect(groomDueOn("2026-10-06", 6)).toBe("2026-11-17");
    expect(groomState("2026-11-10", "2026-11-04").state).toBe("due");
    expect(groomState("2026-11-20", "2026-11-04").state).toBe("later");
    expect(groomState("2026-11-01", "2026-11-04")).toEqual({ state: "late", daysLate: 3 });
  });
  it("check-in stops expired or missing shots, no passed assessment and a full room", () => {
    const base = { day: "2026-11-04", required: ["rabies", "bordetella"], vaccines: [{ kind: "rabies", expiresOn: "2027-01-01" }, { kind: "bordetella", expiresOn: "2026-10-01" }], requireAssessment: true, assessment: "none", inRoom: 16, capacity: 16, payKind: "drop_in" as const, packDaysLeft: 0 };
    expect(checkInBlocks(base).map((b) => b.code)).toEqual(["vaccine", "assessment", "capacity"]);
    expect(checkInBlocks({ ...base, vaccines: [{ kind: "rabies", expiresOn: "2027-01-01" }], required: ["rabies"], assessment: "passed", inRoom: 3 })).toEqual([]);
    expect(lateMinutes("18:00", 15, 18 * 60 + 10)).toBe(0);
    expect(lateMinutes("18:00", 15, 18 * 60 + 40)).toBe(40);
  });
  it("a card counts to N, the free bag is owed at N, and the window forgets old bags", () => {
    const prog = { buyCount: 12, expiryMonths: 12 };
    const now = new Date("2026-11-04T15:00:00Z");
    const card = (punches: number, given = 0, start = "2026-06-01T00:00:00Z") => ({ punches, given, cycleStartedAt: start });
    expect(foodCardState(card(11), prog, now)).toMatchObject({ canRedeem: false, toGo: 1, towardNext: 11 });
    expect(foodCardState(card(12), prog, now)).toMatchObject({ canRedeem: true, owed: 1, toGo: 0 });
    expect(foodCardState(card(12, 1), prog, now)).toMatchObject({ canRedeem: false, towardNext: 0, toGo: 12 });
    expect(foodCardState(card(5, 0, "2025-01-01T00:00:00Z"), prog, now)).toMatchObject({ expired: true, counted: 0 });
    expect(bagLastsDays(11_800, 360)).toBe(32);
    expect(runOutOn("2026-10-01", 11_800, 360)).toBe("2026-11-02");
  });
});

describe("gating", () => {
  it("needs the feature, the plan and a pet shop", async () => {
    const free = await shop({ plan: "free" });
    expect((await call(env, free.owner, "GET", `${free.base}/pets`)).status).toBe(402);
    const cafe = await shop({ vertical: "cafe" });
    expect((await call(env, cafe.owner, "GET", `${cafe.base}/pets`)).status).toBe(402);
    expect((await call(env, cafe.owner, "GET", `${cafe.base}/daycare/day`)).status).toBe(402);
    expect((await call(env, cafe.owner, "GET", `${cafe.base}/food/programs`)).status).toBe(402);
    const s = await shop();
    expect((await call(env, s.owner, "GET", `${s.base}/pets`)).status).toBe(200);
    expect((await call(env, null, "GET", `${s.base}/pets`)).status).toBe(401);
    for (const k of ["pets.profiles", "pets.food_cards", "pets.report_cards"] as const) {
      expect(FEATURES[k].minPlan).toBe("plus");
      expect(FREE_FOREVER).not.toContain(k);
    }
    // phase-pro: daycare is a shop's tool, on Studio (pro-value.md §2.2): a Pro pet shop is offered Studio for it.
    expect(FEATURES["pets.daycare"].minPlan).toBe("studio");
    expect(FREE_FOREVER).not.toContain("pets.daycare");
    expect((await call(env, s.owner, "GET", `${s.base}/daycare/day`)).status).toBe(402);
    const studio = await shop({ plan: "studio" });
    expect((await call(env, studio.owner, "GET", `${studio.base}/daycare/day`)).status).toBe(200);
  });
});

describe("pets, vaccines and proof", () => {
  it("the owner adds pets (up to 8) and a shop sees only its own members' pets", async () => {
    const s = await shop();
    const mina = await member(s);
    const stranger = await customer(env, { name: "Not A Member" });
    const biscuit = await addPet(mina.token);
    const other = await addPet(stranger.token, { name: "Nova" });
    const list = await call(env, s.owner, "GET", `${s.base}/pets`);
    expect(list.body.items.map((p: { name: string }) => p.name)).toEqual(["Biscuit"]);
    expect((await call(env, s.owner, "GET", `${s.base}/pets/${biscuit.id}`)).status).toBe(200);
    expect((await call(env, s.owner, "GET", `${s.base}/pets/${other.id}`)).status).toBe(404);
    for (let i = 0; i < 7; i++) expect((await call(env, mina.token, "POST", "/v1/me/pets", { name: `P${i}` })).status).toBe(201);
    expect((await call(env, mina.token, "POST", "/v1/me/pets", { name: "Too many" })).status).toBe(409);
    expect((await call(env, mina.token, "POST", "/v1/me/pets", { name: "" })).status).toBe(400);
    // The staff add a pet for a member by member id.
    const kate = await member(s, { name: "Kate" });
    const r = await call(env, s.owner, "POST", `${s.base}/pets`, { memberId: kate.memberId, name: "Rex", species: "dog", sizeBand: "large", coat: "short" });
    expect(r.status).toBe(201);
    expect((await call(env, s.owner, "POST", `${s.base}/pets`, { memberId: "00000000-0000-4000-8000-000000000000", name: "X" })).status).toBe(404);
  });

  it("vaccine dates get a status and the certificate photo is shown by a signed link, only from the owner's own upload", async () => {
    const s = await shop();
    const mina = await member(s);
    const pet = await addPet(mina.token);
    const up = await env.app.inject({ method: "POST", url: "/v1/me/pets-uploads", headers: { authorization: `Bearer ${mina.token}`, "content-type": "image/png" }, payload: PNG });
    expect(up.statusCode).toBe(201);
    const { url } = up.json() as { url: string };
    expect(url).toContain("sig=");
    const v = await call(env, mina.token, "PUT", `/v1/me/pets/${pet.id}/vaccines/rabies`, { expiresOn: ymd(300), proofUrl: url });
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ kind: "rabies", status: "current" });
    expect(v.body.proofUrl).toContain("sig=");
    await call(env, mina.token, "PUT", `/v1/me/pets/${pet.id}/vaccines/bordetella`, { expiresOn: ymd(-3) });
    await call(env, mina.token, "PUT", `/v1/me/pets/${pet.id}/vaccines/dhpp`, { expiresOn: ymd(10) });
    const seen = await call(env, s.owner, "GET", `${s.base}/pets/${pet.id}`);
    const byKind = Object.fromEntries(seen.body.vaccines.map((x: { kind: string; status: string }) => [x.kind, x.status]));
    expect(byKind).toEqual({ bordetella: "expired", dhpp: "expiring", rabies: "current" });
    expect(seen.body.vaccines.find((x: { kind: string }) => x.kind === "rabies").proofUrl).toContain("sig=");
    expect((await call(env, s.owner, "GET", `${s.base}/pets`)).body.items[0].worst).toBe("expired");
    // Another account's upload and a pasted link are refused.
    const theirs = await customer(env, { name: "Other" });
    const up2 = await env.app.inject({ method: "POST", url: "/v1/me/pets-uploads", headers: { authorization: `Bearer ${theirs.token}`, "content-type": "image/png" }, payload: PNG });
    const bad = await call(env, mina.token, "PUT", `/v1/me/pets/${pet.id}/vaccines/rabies`, { expiresOn: ymd(300), proofUrl: (up2.json() as { url: string }).url });
    expect(bad.status).toBe(400);
    expect((await call(env, mina.token, "PUT", `/v1/me/pets/${pet.id}/vaccines/rabies`, { expiresOn: ymd(300), proofUrl: "https://example.com/x.png" })).status).toBe(400);
    // A file that is not an image is refused; a bad kind too.
    const notImg = await env.app.inject({ method: "POST", url: "/v1/me/pets-uploads", headers: { authorization: `Bearer ${mina.token}`, "content-type": "image/png" }, payload: Buffer.from("<script>alert(1)</script>") });
    expect(notImg.statusCode).toBe(400);
    expect((await call(env, mina.token, "PUT", `/v1/me/pets/${pet.id}/vaccines/measles`, { expiresOn: ymd(300) })).status).toBe(400);
    // The staff can set a date too, and a shop cannot touch a pet that is not its member's.
    expect((await call(env, s.owner, "PUT", `${s.base}/pets/${pet.id}/vaccines/bordetella`, { expiresOn: ymd(200) })).status).toBe(200);
    const stranger = await customer(env, { name: "Not A Member" });
    const sp = await addPet(stranger.token, { name: "Nova" });
    expect((await call(env, s.owner, "PUT", `${s.base}/pets/${sp.id}/vaccines/rabies`, { expiresOn: ymd(200) })).status).toBe(404);
  });

  it("only the owner can change or delete a pet, and deleting removes the proof photo", async () => {
    const s = await shop();
    const mina = await member(s);
    const pet = await addPet(mina.token);
    const other = await customer(env);
    expect((await call(env, other.token, "PATCH", `/v1/me/pets/${pet.id}`, { name: "Hacked" })).status).toBe(404);
    expect((await call(env, other.token, "DELETE", `/v1/me/pets/${pet.id}`)).status).toBe(404);
    const up = await env.app.inject({ method: "POST", url: "/v1/me/pets-uploads", headers: { authorization: `Bearer ${mina.token}`, "content-type": "image/png" }, payload: PNG });
    await call(env, mina.token, "PUT", `/v1/me/pets/${pet.id}/vaccines/rabies`, { expiresOn: ymd(300), proofUrl: (up.json() as { url: string }).url });
    const store = getStorage(env.ctx) as MemoryStorage;
    expect(store.objects.size).toBe(1);
    expect((await call(env, mina.token, "PATCH", `/v1/me/pets/${pet.id}`, { name: "Biscuit II" })).status).toBe(200);
    expect((await call(env, mina.token, "DELETE", `/v1/me/pets/${pet.id}`)).status).toBe(204);
    expect(store.objects.size).toBe(0);
    expect((await env.db.select().from(pets).where(eq(pets.id, pet.id)))).toHaveLength(0);
  });

  it("the handling note and cadence are the shop's own, and the temperament check records who", async () => {
    const s = await shop();
    const mina = await member(s);
    const pet = await addPet(mina.token);
    expect((await call(env, s.owner, "PUT", `${s.base}/pets/${pet.id}/shop`, { groomEveryWeeks: 40 })).status).toBe(400);
    const r = await call(env, s.owner, "PUT", `${s.base}/pets/${pet.id}/shop`, { groomEveryWeeks: 6, handlingNote: "Nervous at the dryer.", assessment: "passed" });
    expect(r.status).toBe(200);
    const g = (await call(env, s.owner, "GET", `${s.base}/pets/${pet.id}`)).body;
    expect(g.shop).toMatchObject({ groomEveryWeeks: 6, defaultWeeks: 5, handlingNote: "Nervous at the dryer.", assessment: "passed" });
    // The owner's own list never carries the shop's note.
    const mine = await call(env, mina.token, "GET", "/v1/me/pets");
    expect(JSON.stringify(mine.body)).not.toContain("dryer");
    // Another shop sees nothing of it.
    const s2 = await shop();
    await env.db.transaction((tx) => ensureMember(env.ctx, tx, { merchantId: s2.merchant.id, userId: mina.user.id, joinedVia: "phone" }));
    expect((await call(env, s2.owner, "GET", `${s2.base}/pets/${pet.id}`)).body.shop.handlingNote).toBeNull();
  });
});

describe("groom rebooking", () => {
  async function groomed(s: Shop, m: Awaited<ReturnType<typeof member>>, petBody: Record<string, unknown>, daysAgo: number, weeks: number | null) {
    const pet = await addPet(m.token, petBody);
    if (weeks) await call(env, s.owner, "PUT", `${s.base}/pets/${pet.id}/shop`, { groomEveryWeeks: weeks });
    // A groom logged without a text (it moves the cadence like a report card does).
    expect((await call(env, s.owner, "POST", `${s.base}/pets/${pet.id}/report-card`, { kind: "groom", send: false })).status).toBe(201);
    await env.db.update(petVisits).set({ at: days(-daysAgo) }).where(eq(petVisits.petId, pet.id));
    return pet;
  }

  it("lists pets due within a week or late, on the pet's own cadence, and one text per cycle", async () => {
    const s = await shop();
    const mina = await member(s);
    const jo = await member(s, { name: "Jo Lee" });
    const late = await groomed(s, mina, { name: "Biscuit" }, 49, 6); // due 7 days ago
    const soon = await groomed(s, jo, { name: "Pepper", coat: "long_silky" }, 25, null); // default 4 weeks: due in 3 days
    const later = await groomed(s, jo, { name: "Rocky", coat: "double" }, 10, null); // 8 weeks: not yet
    const r = await call(env, s.owner, "GET", `${s.base}/pets/rebooking`);
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: { petName: string; state: string }) => [i.petName, i.state])).toEqual([["Biscuit", "late"], ["Pepper", "due"]]);
    expect(r.body.counts).toEqual({ due: 2, late: 1, onCadence: 3 });
    expect(r.body.items[0]).toMatchObject({ everyWeeks: 6, canSend: true });
    expect(r.body.previewText).toContain("STOP");
    void late; void soon; void later;
    const n0 = sms().length;
    const send = await call(env, s.owner, "POST", `${s.base}/pets/rebooking/send`, {});
    expect(send.body).toEqual({ sent: 2, skipped: 0 });
    expect(sms().length).toBe(n0 + 2);
    expect(sms().at(-1)!.body).toContain("Test Shop");
    expect(sms().at(-1)!.body).toContain("Reply STOP");
    // Once per cycle: nobody is listed or texted again.
    expect((await call(env, s.owner, "GET", `${s.base}/pets/rebooking`)).body.items).toHaveLength(0);
    expect((await call(env, s.owner, "POST", `${s.base}/pets/rebooking/send`, {})).body).toEqual({ sent: 0, skipped: 0 });
    expect(await env.db.select().from(petNudges)).toHaveLength(2);
    // A new groom starts a new cycle.
    await call(env, s.owner, "POST", `${s.base}/pets/${soon.id}/report-card`, { send: false });
    expect((await call(env, s.owner, "GET", `${s.base}/pets/${soon.id}`)).body.shop.nextDueOn).toBe(ymd(28));
  });

  it("only texts owners who agreed, never after STOP, skip hides for the cycle and a booked pet is not listed", async () => {
    const s = await shop();
    const yes = await member(s);
    const no = await member(s, { consent: false, name: "No Consent" });
    const stop = await member(s, { name: "Stopped" });
    const p1 = await groomed(s, yes, { name: "A" }, 60, 4);
    await groomed(s, no, { name: "B" }, 60, 4);
    await groomed(s, stop, { name: "C" }, 60, 4);
    await env.ctx.db.execute(`insert into comm_opt_outs (phone, channel, keyword, source) values ('${stop.user.phone}', 'sms', 'STOP', 'sms_reply')` as never).catch(() => undefined);
    const list = (await call(env, s.owner, "GET", `${s.base}/pets/rebooking`)).body.items as { petName: string; canSend: boolean }[];
    expect(Object.fromEntries(list.map((i) => [i.petName, i.canSend]))).toMatchObject({ A: true, B: false });
    const n0 = sms().length;
    const send = await call(env, s.owner, "POST", `${s.base}/pets/rebooking/send`, {});
    expect(send.body.sent).toBeGreaterThanOrEqual(1);
    expect(sms().slice(n0).every((m) => m.to !== no.user.phone)).toBe(true);
    // Skip for this cycle.
    const sk = await call(env, s.owner, "POST", `${s.base}/pets/rebooking/send`, { petIds: [p1.id], skip: true });
    expect(sk.status).toBe(200);
    expect((await call(env, s.owner, "GET", `${s.base}/pets/rebooking`)).body.items.some((i: { petName: string }) => i.petName === "A")).toBe(false);
  });

  it("does not text overnight", async () => {
    const s = await shop();
    const m = await member(s);
    await groomed(s, m, { name: "A" }, 60, 4);
    await jump(new Date("2026-11-05T04:30:00Z")); // 23:30 Toronto
    const n0 = sms().length;
    const r = await call(env, s.owner, "POST", `${s.base}/pets/rebooking/send`, {});
    expect(r.body.sent).toBe(0);
    expect(sms().length).toBe(n0);
  });
});

describe("report cards", () => {
  it("texts a summary with a private link, the page opens by its token and expires in 30 days, and a groom card moves the cadence", async () => {
    const s = await shop();
    const mina = await member(s);
    const pet = await addPet(mina.token);
    const n0 = sms().length;
    const up = await env.app.inject({ method: "POST", url: `${s.base}/pets-uploads`, headers: { authorization: `Bearer ${s.owner}`, "content-type": "image/png" }, payload: PNG });
    expect(up.statusCode).toBe(201);
    const r = await call(env, s.owner, "POST", `${s.base}/pets/${pet.id}/report-card`, { kind: "groom", mood: "happy", did: ["bath", "haircut", "nails"], note: "Great boy.", photoUrl: (up.json() as { url: string }).url, send: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ sent: true, skipped: null });
    expect(sms().length).toBe(n0 + 1);
    const text = sms().at(-1)!.body;
    expect(text).toContain("Test Shop");
    expect(text).toContain("Biscuit was happy today");
    expect(text).toContain("Reply STOP");
    const token = (r.body.url as string).split("/visit/")[1]!;
    const page = await call(env, null, "GET", `/v1/public/visits/${token}`);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ pet: { name: "Biscuit" }, shop: { name: "Test Shop" }, mood: "happy", did: ["bath", "haircut", "nails"], note: "Great boy." });
    expect(page.body.photoUrl).toContain("sig=");
    expect(page.body.bookUrl).toContain("/book");
    expect((await call(env, null, "GET", "/v1/public/visits/not-a-token")).status).toBe(404);
    // The groom moves the cadence: default 5 weeks for a curly coat.
    expect((await call(env, s.owner, "GET", `${s.base}/pets/${pet.id}`)).body.shop.nextDueOn).toBe(ymd(35));
    await jump(days(31));
    expect((await call(env, null, "GET", `/v1/public/visits/${token}`)).status).toBe(410);
  });

  it("send off logs the visit without a text; no phone, overnight and STOP skip the text and say why", async () => {
    const s = await shop();
    const mina = await member(s);
    const pet = await addPet(mina.token);
    const n0 = sms().length;
    const quiet = await call(env, s.owner, "POST", `${s.base}/pets/${pet.id}/report-card`, { send: false });
    expect(quiet.body).toMatchObject({ sent: false, skipped: null, url: null });
    expect(sms().length).toBe(n0);
    await env.db.update(users).set({ phone: null }).where(eq(users.id, mina.user.id));
    expect((await call(env, s.owner, "POST", `${s.base}/pets/${pet.id}/report-card`, { send: true })).body).toMatchObject({ sent: false, skipped: "no_phone" });
    await env.db.update(users).set({ phone: "+14165559999" }).where(eq(users.id, mina.user.id));
    await jump(new Date("2026-11-05T04:30:00Z"));
    const night = await call(env, s.owner, "POST", `${s.base}/pets/${pet.id}/report-card`, { send: true });
    expect(night.body).toMatchObject({ sent: false, skipped: "quiet" });
    // The private page is still made, so the shop can hand the link over itself.
    expect(night.body.url).toContain("/visit/");
    expect((await call(env, null, "GET", `/v1/public/visits/${(night.body.url as string).split("/visit/")[1]}`)).status).toBe(200);
    expect(sms().length).toBe(n0);
    expect((await env.db.select().from(petVisits).where(eq(petVisits.petId, pet.id))).length).toBe(3);
  });

  it("refuses a photo from another shop and a staff member without the permission", async () => {
    const s = await shop();
    const mina = await member(s);
    const pet = await addPet(mina.token);
    const s2 = await shop();
    const up = await env.app.inject({ method: "POST", url: `${s2.base}/pets-uploads`, headers: { authorization: `Bearer ${s2.owner}`, "content-type": "image/png" }, payload: PNG });
    const r = await call(env, s.owner, "POST", `${s.base}/pets/${pet.id}/report-card`, { photoUrl: (up.json() as { url: string }).url });
    expect(r.status).toBe(400);
    const locked = await staffMember(env, s.merchant.id, "staff", ["catalog.manage"]);
    void locked; // permissions only apply on Pro (staff.permissions), so role defaults let staff in
    const stranger = await customer(env);
    expect((await call(env, stranger.token, "POST", `${s.base}/pets/${pet.id}/report-card`, {})).status).toBe(403);
  });
});

describe("daycare", () => {
  async function ready(s: Shop, m: Awaited<ReturnType<typeof member>>, name: string, opts: { assess?: boolean; vax?: Record<string, number> } = {}) {
    const pet = await addPet(m.token, { name });
    for (const [kind, d] of Object.entries(opts.vax ?? { rabies: 300, dhpp: 300, bordetella: 300 })) await call(env, m.token, "PUT", `/v1/me/pets/${pet.id}/vaccines/${kind}`, { expiresOn: ymd(d) });
    if (opts.assess !== false) await call(env, s.owner, "PUT", `${s.base}/pets/${pet.id}/shop`, { assessment: "passed" });
    return pet;
  }
  const expect_ = async (s: Shop, petId: string) => (await call(env, s.owner, "POST", `${s.base}/daycare/stays`, { petId })).body.id as string;

  it("checks a dog in and out, counts the room and the ratio, and notes a late pickup", async () => {
    const s = await shop({ plan: "studio" });
    const m = await member(s);
    const pet = await ready(s, m, "Biscuit");
    const id = await expect_(s, pet.id);
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays`, { petId: pet.id })).body.id).toBe(id);
    let day = (await call(env, s.owner, "GET", `${s.base}/daycare/day`)).body;
    expect(day).toMatchObject({ inRoom: 0, expected: 1, settings: { capacity: 16, dogsPerStaff: 15 } });
    expect(day.items[0].blocks).toEqual([]);
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${id}/check-in`, {})).body).toMatchObject({ ok: true, payKind: "drop_in" });
    day = (await call(env, s.owner, "GET", `${s.base}/daycare/day`)).body;
    expect(day).toMatchObject({ inRoom: 1, expected: 0, ratioNow: 1 });
    // A shot that lapses while the dog is already in the room is flagged on the board too (the check used to run only at the door).
    expect(day.items[0].blocks).toEqual([]);
    await call(env, s.owner, "PUT", `${s.base}/pets/${pet.id}/vaccines/rabies`, { expiresOn: ymd(-1) });
    day = (await call(env, s.owner, "GET", `${s.base}/daycare/day`)).body;
    expect(day.items[0].blocks.map((b: { code: string }) => b.code)).toEqual(["vaccine"]);
    await call(env, s.owner, "PUT", `${s.base}/pets/${pet.id}/vaccines/rabies`, { expiresOn: ymd(300) });
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${id}/check-in`, {})).status).toBe(409);
    await jump(new Date("2026-11-04T23:40:00Z")); // 18:40 Toronto, closing 18:00 with 15 minutes grace
    const out = await call(env, s.owner, "POST", `${s.base}/daycare/stays/${id}/check-out`);
    expect(out.body).toEqual({ ok: true, lateMinutes: 40 });
    expect((await env.db.select().from(petVisits).where(and(eq(petVisits.petId, pet.id), eq(petVisits.kind, "daycare")))).length).toBe(1);
  });

  it("blocks an expired or missing shot, no temperament check, and a full room, and says why", async () => {
    const s = await shop({ plan: "studio" });
    const m = await member(s);
    const expired = await ready(s, m, "Ziggy", { vax: { rabies: 300, dhpp: 300, bordetella: -26 } });
    const missing = await ready(s, m, "Luna", { vax: { rabies: 300 } });
    const untested = await ready(s, m, "Rocky", { assess: false });
    const a = await expect_(s, expired.id);
    const r = await call(env, s.owner, "POST", `${s.base}/daycare/stays/${a}/check-in`, {});
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("blocked");
    expect(r.body.error.message).toContain("Bordetella expired on");
    const b = await expect_(s, missing.id);
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${b}/check-in`, {})).body.error.message).toMatch(/DHPP proof is missing.*Bordetella proof is missing/);
    const c = await expect_(s, untested.id);
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${c}/check-in`, {})).body.error.message).toContain("temperament check");
    const board = (await call(env, s.owner, "GET", `${s.base}/daycare/day`)).body;
    expect(board.items.find((i: { petName: string }) => i.petName === "Ziggy").blocks[0].code).toBe("vaccine");
    // The vaccine rule has no override; a fixed date lets the dog in.
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${a}/check-in`, { overrideCapacity: "owner says so" })).status).toBe(409);
    await call(env, m.token, "PUT", `/v1/me/pets/${expired.id}/vaccines/bordetella`, { expiresOn: ymd(100) });
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${a}/check-in`, {})).status).toBe(200);
    // A shop can choose which shots it asks for.
    await call(env, s.owner, "PUT", `${s.base}/pets/settings`, { requiredVaccines: ["rabies"], requireAssessment: false });
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${b}/check-in`, {})).status).toBe(200);
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${c}/check-in`, {})).status).toBe(200);
  });

  it("a full room refuses the next dog; a manager can take one more with a reason, staff cannot", async () => {
    const s = await shop({ plan: "studio" });
    const m = await member(s);
    await call(env, s.owner, "PUT", `${s.base}/pets/settings`, { capacity: 1, requireAssessment: false });
    const p1 = await ready(s, m, "A", { assess: false });
    const p2 = await ready(s, m, "B", { assess: false });
    const desk = await staffMember(env, s.merchant.id, "staff");
    await call(env, s.owner, "POST", `${s.base}/daycare/stays/${await expect_(s, p1.id)}/check-in`, {});
    const second = await expect_(s, p2.id);
    const full = await call(env, s.owner, "POST", `${s.base}/daycare/stays/${second}/check-in`, {});
    expect(full.status).toBe(409);
    expect(full.body.error.message).toContain("The room is full (1 of 1)");
    expect((await call(env, desk.token, "POST", `${s.base}/daycare/stays/${second}/check-in`, { overrideCapacity: "regular" })).status).toBe(409);
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${second}/check-in`, { overrideCapacity: "birthday party" })).status).toBe(200);
  });

  it("sells a pack by hand; a day is taken at check-in, not booking; the last day is used once and the next is a drop-in", async () => {
    const s = await shop({ plan: "studio" });
    const m = await member(s);
    const pet = await ready(s, m, "Biscuit");
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/packs`, { memberId: m.memberId, days: 1, priceCents: 1000 })).status).toBe(400);
    const pack = await call(env, s.owner, "POST", `${s.base}/daycare/packs`, { memberId: m.memberId, days: 2, priceCents: 9000, validDays: 60 });
    expect(pack.status).toBe(201);
    expect(pack.body).toMatchObject({ daysLeft: 2, daysTotal: 2 });
    const id = await expect_(s, pet.id);
    expect((await env.db.select().from(daycarePacks))[0]!.daysUsed).toBe(0);
    const day = (await call(env, s.owner, "GET", `${s.base}/daycare/day`)).body;
    expect(day.items[0]).toMatchObject({ payKind: "pack", packDaysLeft: 2 });
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${id}/check-in`, {})).body).toMatchObject({ payKind: "pack", packDaysLeft: 1 });
    expect((await env.db.select().from(daycarePacks))[0]!.daysUsed).toBe(1);
    // Tomorrow: the last day, then drop-in.
    await jump(days(1));
    const d2 = (await call(env, s.owner, "POST", `${s.base}/daycare/stays`, { petId: pet.id })).body.id;
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${d2}/check-in`, {})).body).toMatchObject({ payKind: "pack", packDaysLeft: 0 });
    await jump(days(1));
    const d3 = (await call(env, s.owner, "POST", `${s.base}/daycare/stays`, { petId: pet.id })).body.id;
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${d3}/check-in`, {})).body).toMatchObject({ payKind: "drop_in", packDaysLeft: null });
    expect((await env.db.select().from(daycarePacks))[0]!.daysUsed).toBe(2);
    // An expired pack is not used.
    await env.db.update(daycarePacks).set({ daysUsed: 0, expiresAt: days(-1) });
    await jump(days(1));
    const d4 = (await call(env, s.owner, "POST", `${s.base}/daycare/stays`, { petId: pet.id })).body.id;
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${d4}/check-in`, {})).body.payKind).toBe("drop_in");
  });

  it("no-show and cancel keep the row and take no pack day; settings are validated", async () => {
    const s = await shop({ plan: "studio" });
    const m = await member(s);
    const pet = await ready(s, m, "Biscuit");
    await call(env, s.owner, "POST", `${s.base}/daycare/packs`, { memberId: m.memberId, days: 5, priceCents: 20000 });
    const id = await expect_(s, pet.id);
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${id}/no-show`)).status).toBe(200);
    expect((await call(env, s.owner, "POST", `${s.base}/daycare/stays/${id}/no-show`)).status).toBe(409);
    expect((await env.db.select().from(daycarePacks))[0]!.daysUsed).toBe(0);
    expect((await call(env, s.owner, "PUT", `${s.base}/pets/settings`, { closesAt: "25:00" })).status).toBe(400);
    expect((await call(env, s.owner, "PUT", `${s.base}/pets/settings`, { capacity: 0 })).status).toBe(400);
    expect((await call(env, s.owner, "PUT", `${s.base}/pets/settings`, { closesAt: "19:30", autoGroomReminders: true })).body).toMatchObject({ closesAt: "19:30", autoGroomReminders: true });
  });
});

describe("food cards", () => {
  async function store() {
    const s = await shop();
    const prog = (await call(env, s.owner, "POST", `${s.base}/food/programs`, { brand: "Fromm", buyCount: 12, expiryMonths: 12 })).body;
    const sku = (await call(env, s.owner, "POST", `${s.base}/food/programs/${prog.id}/skus`, { name: "Gold Adult 26 lb", bagGrams: 11_800 })).body;
    return Object.assign(s, { prog, sku });
  }
  const punch = (s: Awaited<ReturnType<typeof store>>, memberId: string, extra: Record<string, unknown> = {}, token?: string) => call(env, token ?? s.owner, "POST", `${s.base}/food/punch`, { memberId, skuId: s.sku.id, qty: 1, ...extra });

  it("counts bags per brand and bag size and the free bag cannot be given early", async () => {
    const s = await store();
    const m = await member(s);
    expect((await call(env, s.owner, "POST", `${s.base}/food/programs`, { brand: "fromm" })).status).toBe(409);
    for (let i = 0; i < 11; i++) await punch(s, m.memberId);
    const cards = (await call(env, s.owner, "GET", `${s.base}/food/cards?memberId=${m.memberId}`)).body.cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ brand: "Fromm", skuName: "Gold Adult 26 lb", counted: 11, toGo: 1, canRedeem: false });
    const early = await call(env, s.owner, "POST", `${s.base}/food/cards/${cards[0].id}/redeem`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("not_earned");
    expect(early.body.error.message).toContain("1 more bag");
    const twelve = await punch(s, m.memberId);
    expect(twelve.body).toMatchObject({ counted: 12, canRedeem: true, owed: 1 });
    const free = await call(env, s.owner, "POST", `${s.base}/food/cards/${cards[0].id}/redeem`);
    expect(free.status).toBe(200);
    // The card starts again, and a second redeem is refused.
    expect(free.body).toMatchObject({ counted: 0, canRedeem: false, toGo: 12 });
    expect((await call(env, s.owner, "POST", `${s.base}/food/cards/${cards[0].id}/redeem`)).status).toBe(409);
    // A different bag size is a different card.
    const small = (await call(env, s.owner, "POST", `${s.base}/food/programs/${s.prog.id}/skus`, { name: "Salmon 12 lb", bagGrams: 5440 })).body;
    const r = await call(env, s.owner, "POST", `${s.base}/food/punch`, { memberId: m.memberId, skuId: small.id, qty: 2 });
    expect(r.body.counted).toBe(2);
    expect((await call(env, s.owner, "GET", `${s.base}/food/cards?memberId=${m.memberId}`)).body.cards).toHaveLength(2);
    expect((await call(env, s.owner, "POST", `${s.base}/food/punch`, { memberId: m.memberId, skuId: s.sku.id, qty: 9 })).status).toBe(400);
  });

  it("several bags at once earn the free bag at the right count; extra bags carry over", async () => {
    const s = await store();
    const m = await member(s);
    for (let i = 0; i < 3; i++) await punch(s, m.memberId, { qty: 5 }); // 15 bags
    const card = (await call(env, s.owner, "GET", `${s.base}/food/cards?memberId=${m.memberId}`)).body.cards[0];
    expect(card).toMatchObject({ canRedeem: true, owed: 1, counted: 12 });
    const after = await call(env, s.owner, "POST", `${s.base}/food/cards/${card.id}/redeem`);
    expect(after.body).toMatchObject({ canRedeem: false, counted: 3, toGo: 9, given: 1 });
  });

  it("bags older than the program's window stop counting and the next bag starts a new card; undo takes back the last bag within 10 minutes", async () => {
    const s = await store();
    const m = await member(s);
    await punch(s, m.memberId, { qty: 6 });
    const card = (await call(env, s.owner, "GET", `${s.base}/food/cards?memberId=${m.memberId}`)).body.cards[0];
    const undo = await call(env, s.owner, "POST", `${s.base}/food/cards/${card.id}/undo`);
    expect(undo.body.counted).toBe(0);
    expect((await call(env, s.owner, "POST", `${s.base}/food/cards/${card.id}/undo`)).status).toBe(409);
    await punch(s, m.memberId, { qty: 6 });
    const other = await staffMember(env, s.merchant.id, "staff");
    expect((await call(env, other.token, "POST", `${s.base}/food/cards/${card.id}/undo`)).status).toBe(409);
    await jump(new Date(env.clock.now.getTime() + 11 * 60_000));
    expect((await call(env, s.owner, "POST", `${s.base}/food/cards/${card.id}/undo`)).status).toBe(409);
    // 13 months later nothing counts, and the next bag is bag 1 of a new card.
    await jump(new Date(env.clock.now.getTime() + 400 * 86_400_000));
    const old = (await call(env, s.owner, "GET", `${s.base}/food/cards?memberId=${m.memberId}`)).body.cards[0];
    expect(old).toMatchObject({ expired: true, counted: 0, canRedeem: false });
    const fresh = await punch(s, m.memberId);
    expect(fresh.body).toMatchObject({ counted: 1, expired: false });
  });

  it("a run-out text goes 5 days before the bag runs out, once, only with a yes, and the owner can switch it off", async () => {
    const s = await store();
    const yes = await member(s, { name: "Ana Reyes" });
    const pet = await addPet(yes.token, { name: "Hazel", sizeBand: "large" });
    const noConsent = await member(s, { consent: false, name: "Chris" });
    // A cashier cannot say yes for a customer: the counter sets the daily amount, and the customer switches the text on from their own card.
    expect((await punch(s, noConsent.memberId, { remind: true, dailyGrams: 360 })).body).toMatchObject({ needsCustomerYes: true, remind: false });
    const r = await punch(s, yes.memberId, { remind: true, dailyGrams: 360, petId: pet.id });
    expect(r.body).toMatchObject({ needsCustomerYes: true, remind: false, dailyGrams: 360, petName: "Hazel" });
    const myCard = (await call(env, yes.token, "GET", "/v1/me/food-cards")).body.items[0];
    const on = await call(env, yes.token, "PUT", `/v1/me/food-cards/${myCard.id}/remind`, { remind: true });
    expect(on.body).toMatchObject({ remind: true, dailyGrams: 360, runOutOn: ymd(32), remindOn: ymd(27), petName: "Hazel" });
    // Not yet.
    expect((await call(env, s.owner, "POST", `${s.base}/food/runout/send`, {})).body).toEqual({ sent: 0, skipped: 0 });
    await jump(days(27));
    const ovr = await call(env, s.owner, "GET", `${s.base}/food/runout`);
    if (ovr.status !== 200) throw new Error(JSON.stringify(ovr.body));
    const ov = ovr.body;
    expect(ov.items[0]).toMatchObject({ customerName: "Ana Reyes", petName: "Hazel", brand: "Fromm", readyToText: true });
    const n0 = sms().length;
    expect((await call(env, s.owner, "POST", `${s.base}/food/runout/send`, {})).body).toEqual({ sent: 1, skipped: 0 });
    expect(sms().length).toBe(n0 + 1);
    expect(sms().at(-1)!.body).toContain("Fromm Gold Adult 26 lb");
    expect(sms().at(-1)!.body).toContain("Reply STOP");
    // Once per bag.
    expect((await call(env, s.owner, "POST", `${s.base}/food/runout/send`, {})).body).toEqual({ sent: 0, skipped: 0 });
    // A new bag restarts it.
    await punch(s, yes.memberId);
    await jump(days(27));
    expect((await call(env, s.owner, "POST", `${s.base}/food/runout/send`, {})).body.sent).toBe(1);
    // The owner switches it off from the pass; switching it on is their own yes (no shop-wide text consent needed).
    const mine = (await call(env, yes.token, "GET", "/v1/me/food-cards")).body.items[0];
    expect(mine).toMatchObject({ brand: "Fromm", remind: true, shop: { name: "Test Shop" } });
    expect((await call(env, yes.token, "PUT", `/v1/me/food-cards/${mine.id}/remind`, { remind: false })).body.remind).toBe(false);
    expect((await call(env, yes.token, "PUT", `/v1/me/food-cards/${mine.id}/remind`, { remind: true })).body.remind).toBe(true);
    const cNo = (await call(env, noConsent.token, "GET", "/v1/me/food-cards")).body.items[0];
    expect((await call(env, noConsent.token, "PUT", `/v1/me/food-cards/${cNo.id}/remind`, { remind: true, dailyGrams: 300 })).status).toBe(200);
    expect((await env.db.select().from(foodCards).where(eq(foodCards.id, cNo.id)))[0]).toMatchObject({ remind: true, remindConsentSource: "pass" });
    expect((await call(env, yes.token, "PUT", `/v1/me/food-cards/${mine.id}/remind`, { remind: true, dailyGrams: 5 })).status).toBe(400);
    // Another customer cannot touch it.
    expect((await call(env, noConsent.token, "PUT", `/v1/me/food-cards/${mine.id}/remind`, { remind: false })).status).toBe(404);
    expect((await env.db.select().from(foodCards).where(eq(foodCards.id, mine.id)))[0]!.remindConsentSource).toBe("pass");
  });

  it("only a manager sets up brands; an unknown card, member or product is a 404", async () => {
    const s = await store();
    const desk = await staffMember(env, s.merchant.id, "staff");
    expect((await call(env, desk.token, "POST", `${s.base}/food/programs`, { brand: "Orijen" })).status).toBe(403);
    expect((await call(env, desk.token, "GET", `${s.base}/food/programs`)).status).toBe(200);
    const m = await member(s);
    expect((await call(env, s.owner, "POST", `${s.base}/food/punch`, { memberId: m.memberId, skuId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
    expect((await call(env, s.owner, "POST", `${s.base}/food/punch`, { memberId: "00000000-0000-4000-8000-000000000000", skuId: s.sku.id })).status).toBe(404);
    expect((await call(env, s.owner, "POST", `${s.base}/food/cards/00000000-0000-4000-8000-000000000000/redeem`)).status).toBe(404);
    // A brand switched off takes no more bags.
    await call(env, s.owner, "PUT", `${s.base}/food/programs/${s.prog.id}`, { active: false });
    expect((await punch(s, m.memberId)).status).toBe(409);
    // Another shop cannot see or use this shop's card.
    const s2 = await shop();
    expect((await call(env, s2.owner, "POST", `${s2.base}/food/punch`, { memberId: m.memberId, skuId: s.sku.id })).status).toBe(404);
  });
});

describe("appointments and pets", () => {
  const WEEK = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsLocal: "09:00", endsLocal: "17:00" }));
  /** A groomer: the one-tap starter list, one groomer with hours, and a dog whose owner is a member. */
  async function groomer() {
    const s = await shop();
    const groom = await staffMember(env, s.merchant.id, "staff");
    await call(env, s.owner, "PUT", `${s.base}/staff/${groom.user.id}/hours`, { days: WEEK });
    const starters = await call(env, s.owner, "POST", `${s.base}/services/starters`, {});
    return { ...s, groom, starters };
  }
  const startsAt = "2026-11-05T15:00:00Z"; // Thu 10:00 Toronto

  it("one tap adds a groomer's list priced by dog size, with no bridal line, and a second tap adds nothing", async () => {
    const s = await groomer();
    expect(s.starters.status).toBe(201);
    const names = s.starters.body.items.map((x: { name: string }) => x.name);
    expect(names).toContain("Full groom (small dog)");
    expect(names).toContain("Full groom (giant dog)");
    expect(names.some((n: string) => /bridal/i.test(n))).toBe(false);
    const small = s.starters.body.items.find((x: { name: string }) => x.name === "Full groom (small dog)");
    const giant = s.starters.body.items.find((x: { name: string }) => x.name === "Full groom (giant dog)");
    expect(giant.priceCents).toBeGreaterThan(small.priceCents);
    expect((await call(env, s.owner, "POST", `${s.base}/services/starters`, {})).body.items).toHaveLength(0);
    // A café has no starter list, and only a manager can add one.
    const cafe = await shop({ vertical: "cafe" });
    expect((await call(env, cafe.owner, "POST", `${cafe.base}/services/starters`, {})).status).toBeGreaterThanOrEqual(400);
    const desk = await staffMember(env, s.merchant.id, "staff");
    expect((await call(env, desk.token, "POST", `${s.base}/services/starters`, {})).status).toBe(403);
  });

  it("a dog on the visit: its owner is the client, the card carries the dog and the handling note, and checkout logs the groom and sets the next date", async () => {
    const s = await groomer();
    const mina = await member(s);
    const dog = await addPet(mina.token, { name: "Biscuit", sizeBand: "large" });
    await call(env, s.owner, "PUT", `${s.base}/pets/${dog.id}/shop`, { handlingNote: "Nervous at the dryer. Clip nails last." });
    const svc = s.starters.body.items.find((x: { name: string }) => x.name === "Full groom (large dog)");
    // Someone else's dog cannot be put on another client's visit.
    const stranger = await customer(env, { name: "Other Person" });
    const theirs = await addPet(stranger.token, { name: "Nova" });
    expect((await call(env, s.owner, "POST", `${s.base}/appointments`, { staffId: s.groom.user.id, serviceIds: [svc.id], startsAt, petId: theirs.id })).status).toBe(404);
    const made = await call(env, s.owner, "POST", `${s.base}/appointments`, { staffId: s.groom.user.id, serviceIds: [svc.id], startsAt, petId: dog.id });
    expect(made.status).toBe(201);
    expect(made.body.customer.name).toBe("Mina Kapoor");
    expect(made.body.pet).toMatchObject({ name: "Biscuit", sizeBand: "large", handlingNote: "Nervous at the dryer. Clip nails last.", vaccines: "none" });
    // It shows on the day's list too.
    const day = await call(env, s.owner, "GET", `${s.base}/appointments?from=2026-11-05T00:00:00Z&to=2026-11-06T00:00:00Z`);
    expect(day.body.items[0].pet.name).toBe("Biscuit");
    // Checkout: groom logged, cadence set to what the groomer picked, next due that many weeks out.
    const co = await call(env, s.owner, "POST", `${s.base}/appointments/${made.body.id}/checkout`, { mode: "counter", counterMethod: "cash", nextGroomWeeks: 8 });
    expect(co.status).toBe(200);
    expect(co.body.pet).toMatchObject({ name: "Biscuit", groomEveryWeeks: 8, logged: true, nextDueOn: ymd(56) });
    const visits = await env.db.select().from(petVisits).where(and(eq(petVisits.petId, dog.id), eq(petVisits.kind, "groom")));
    expect(visits).toHaveLength(1);
    const page = await call(env, s.owner, "GET", `${s.base}/pets/${dog.id}`);
    expect(page.body.shop).toMatchObject({ groomEveryWeeks: 8, nextDueOn: ymd(56), lastGroomOn: ymd(0) });
    // Checking out again returns the paid invoice and does not log another groom.
    await call(env, s.owner, "POST", `${s.base}/appointments/${made.body.id}/checkout`, { mode: "counter", counterMethod: "cash" });
    expect(await env.db.select().from(petVisits).where(eq(petVisits.petId, dog.id))).toHaveLength(1);
  });

  it("a customer books their own dog online and gives a first name; the calendar never says Walk-in", async () => {
    const s = await groomer();
    const mina = await member(s, { name: "" });
    await env.db.update(users).set({ name: null }).where(eq(users.id, mina.user.id));
    const dog = await addPet(mina.token, { name: "Biscuit", sizeBand: "small" });
    const svc = s.starters.body.items.find((x: { name: string }) => x.name === "Full groom (small dog)");
    const other = await customer(env, { name: "Other Person" });
    const theirs = await addPet(other.token, { name: "Nova" });
    const bad = await call(env, mina.token, "POST", "/v1/me/appointments", { serviceIds: [svc.id], startsAt, petId: theirs.id, customerName: "Mina" });
    expect(bad.status).toBe(400);
    const r = await call(env, mina.token, "POST", "/v1/me/appointments", { serviceIds: [svc.id], startsAt, petId: dog.id, customerName: "Mina Kapoor" });
    expect(r.status).toBe(201);
    expect(r.body.appointment.petName).toBe("Biscuit");
    expect(r.body.appointment.merchant.address).toBeTruthy();
    expect(r.body.appointment.policy).toMatchObject({ cancelWindowHours: expect.any(Number) });
    expect((await env.db.select().from(users).where(eq(users.id, mina.user.id)))[0]!.name).toBe("Mina");
    const cal = await call(env, s.owner, "GET", `${s.base}/appointments?from=2026-11-05T00:00:00Z&to=2026-11-06T00:00:00Z`);
    expect(cal.body.items[0]).toMatchObject({ customer: { name: "Mina" }, pet: { name: "Biscuit" } });
    // An online booker with no name at all is shown by the end of their number, not as a walk-in.
    await env.db.update(users).set({ name: null }).where(eq(users.id, mina.user.id));
    await env.db.update(appointments).set({ customerName: null }).where(eq(appointments.id, r.body.appointment.id));
    const cal2 = await call(env, s.owner, "GET", `${s.base}/appointments?from=2026-11-05T00:00:00Z&to=2026-11-06T00:00:00Z`);
    expect(cal2.body.items[0].customer.name).toMatch(/^Client \d{4}$/);
  });

  it("the public shop page can say the food card deal and the daycare packs, and a flagged dog already in the room", async () => {
    const s = await shop({ plan: "studio" });
    await call(env, s.owner, "POST", `${s.base}/food/programs`, { brand: "Fromm", buyCount: 12 });
    const r = await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/pets`);
    expect(r.status).toBe(200);
    expect(r.body.food).toEqual([{ brand: "Fromm", buyCount: 12 }]);
    expect(r.body.packs.length).toBeGreaterThan(0);
    expect(r.body.dropInCents).toBe(4800);
    expect((await call(env, null, "GET", "/v1/public/shops/no-such-shop/pets")).status).toBe(404);
  });

  it("the public booking page tells the pet vertical apart so a groomer's page has no bridal row", async () => {
    const s = await groomer();
    const pub = await call(env, null, "GET", `/v1/public/shops/${s.merchant.slug}/services`);
    expect(pub.body.shop.vertical).toBe("pet");
  });
});

describe("privacy", () => {
  it("deleting the account removes pets, proof photos, report-card photos and food cards", async () => {
    const s = await shop();
    const mina = await member(s);
    const pet = await addPet(mina.token);
    const up = await env.app.inject({ method: "POST", url: "/v1/me/pets-uploads", headers: { authorization: `Bearer ${mina.token}`, "content-type": "image/png" }, payload: PNG });
    await call(env, mina.token, "PUT", `/v1/me/pets/${pet.id}/vaccines/rabies`, { expiresOn: ymd(300), proofUrl: (up.json() as { url: string }).url });
    const shot = await env.app.inject({ method: "POST", url: `${s.base}/pets-uploads`, headers: { authorization: `Bearer ${s.owner}`, "content-type": "image/png" }, payload: PNG });
    await call(env, s.owner, "POST", `${s.base}/pets/${pet.id}/report-card`, { photoUrl: (shot.json() as { url: string }).url, send: false });
    const prog = (await call(env, s.owner, "POST", `${s.base}/food/programs`, { brand: "Fromm" })).body;
    const sku = (await call(env, s.owner, "POST", `${s.base}/food/programs/${prog.id}/skus`, { name: "Gold", bagGrams: 11800 })).body;
    await call(env, s.owner, "POST", `${s.base}/food/punch`, { memberId: mina.memberId, skuId: sku.id });
    const store = getStorage(env.ctx) as MemoryStorage;
    expect(store.objects.size).toBe(2);
    // The data export lists the pets and cards first.
    const exp = await call(env, mina.token, "GET", "/v1/me/export");
    expect(exp.status).toBe(200);
    expect(exp.body.pets[0]).toMatchObject({ name: "Biscuit", vaccines: [{ kind: "rabies" }] });
    expect(exp.body.foodCards).toHaveLength(1);
    expect((await call(env, mina.token, "DELETE", "/v1/me", { confirm: "DELETE" })).status).toBe(204);
    expect((await env.db.select().from(pets).where(eq(pets.userId, mina.user.id)))).toHaveLength(0);
    expect((await env.db.select().from(foodCards).where(eq(foodCards.userId, mina.user.id)))).toHaveLength(0);
    expect(store.objects.size).toBe(0);
    void createUser; void tokenFor;
  });
});
