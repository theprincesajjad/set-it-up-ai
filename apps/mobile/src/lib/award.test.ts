import { describe, expect, it } from "vitest";
import type { staffApi } from "@ll/shared";
import {
  cameInText,
  carryOverLine,
  decideMember,
  isRewardReady,
  matchesHeading,
  maskedRow,
  ordinal,
  stampsLeft,
  visitThisMonth,
  awardQuantity,
  quantityChips,
  activeMultiplier,
  awardButtonLabel,
  awardRef,
  classifyScan,
  cooldownWarning,
  counterReducer,
  estimatePoints,
  formatMoney,
  formatPts,
  groupCode,
  initialCounterState,
  lockedRewardCopy,
  normalizeRedeemInput,
  posAmountPress,
  shortName,
  shouldQueueAward,
  successView,
  undoSecondsLeft,
  type CounterProgram,
  type CounterState,
} from "./award";

const stamps: CounterProgram = { earnType: "stamps", terminology: "stamps", pointsPerDollar: 0, pointsPerVisit: 1, minSpendCents: 0, stampGoal: 10 };
const perDollar: CounterProgram = { earnType: "per_dollar", terminology: "points", pointsPerDollar: 1, pointsPerVisit: 0, minSpendCents: 0, stampGoal: 0 };
const perVisit: CounterProgram = { earnType: "per_visit", terminology: "points", pointsPerDollar: 0, pointsPerVisit: 10, minSpendCents: 0, stampGoal: 0 };

const member = (over: Partial<staffApi.MemberSummaryDto> = {}): staffApi.MemberSummaryDto => ({
  memberId: "11111111-1111-4111-8111-111111111111",
  name: "Alex Chen",
  maskedPhone: "(416) ***-0123",
  memberCode: "K7QX2M9P",
  balance: 8,
  terminology: "stamps",
  visitCount: 8,
  lastVisitAt: null,
  joinedAt: "2026-10-01T12:00:00Z",
  vip: null,
  rewardsAffordable: [],
  nextReward: { rewardId: "r1", name: "Free drink", pointsCost: 10, pointsNeeded: 2, progressPct: 80 },
  discountCards: [],
  openRedemptionCount: 0,
  marketingConsent: false,
  expiryDisclosure: "Stamps never expire.",
  ...over,
});

describe("POS amount entry", () => {
  it("shifts digits in from the right: 1180 → $11.80", () => {
    let c = 0;
    for (const k of ["1", "1", "8", "0"]) c = posAmountPress(c, k);
    expect(c).toBe(1180);
    expect(formatMoney(c)).toBe("$11.80");
  });
  it("backspace and clear", () => {
    expect(posAmountPress(1180, "back")).toBe(118);
    expect(posAmountPress(1180, "clear")).toBe(0);
  });
  it("caps at $99,999.99", () => {
    expect(posAmountPress(9_999_999, "9")).toBe(9_999_999);
    expect(formatMoney(125_000)).toBe("$1,250.00");
  });
});

describe("points estimate and live button label", () => {
  it("per-dollar: $11.80 → Award 11 pts", () => {
    const pts = estimatePoints({ program: perDollar, amountCents: 1180 });
    expect(pts).toBe(11);
    expect(awardButtonLabel(perDollar, { points: pts })).toBe("Award 11 pts");
  });
  it("per-dollar with a 2x promo shows the multiplier", () => {
    const pts = estimatePoints({ program: perDollar, amountCents: 1250, multiplier: 2 });
    expect(pts).toBe(24);
    expect(awardButtonLabel(perDollar, { points: pts, multiplier: 2 })).toBe("Award 24 pts (2x today)");
  });
  it("no-earn category records a visit for 0 pts", () => {
    expect(estimatePoints({ program: perDollar, amountCents: 4000, noEarn: true })).toBe(0);
    expect(awardButtonLabel(perDollar, { points: 0, noEarn: true })).toBe("Record visit (0 pts)");
  });
  it("stamps: one tap 'Add stamp'", () => {
    expect(estimatePoints({ program: stamps, amountCents: 0 })).toBe(1);
    expect(awardButtonLabel(stamps, { points: 1 })).toBe("Add stamp");
    expect(awardButtonLabel(stamps, { points: 2 })).toBe("Add 2 stamps");
  });
  it("per-visit: 'Add visit (+10 pts)'", () => {
    expect(awardButtonLabel(perVisit, { points: estimatePoints({ program: perVisit, amountCents: 0 }) })).toBe("Add visit (+10 pts)");
  });
  it("VIP multiplier applies", () => expect(estimatePoints({ program: perDollar, amountCents: 1000, vipMultiplierPct: 150 })).toBe(15));
  it("new customer", () => expect(awardButtonLabel(stamps, { points: 1, newCustomer: true })).toBe("Add and award"));
});

describe("activeMultiplier", () => {
  const tue = new Date(2026, 9, 20, 15, 0); // Tue Oct 20 2026, 3 pm local
  const promo = { kind: "multiplier", multiplierPct: 200, daysOfWeek: [2], startTime: "14:00", endTime: "17:00", startsAt: "2026-10-01T00:00:00Z", endsAt: null, status: "live" };
  it("applies inside the day/time window", () => expect(activeMultiplier([promo], tue)).toBe(2));
  it("not on another day or time", () => {
    expect(activeMultiplier([promo], new Date(2026, 9, 19, 15, 0))).toBe(1);
    expect(activeMultiplier([promo], new Date(2026, 9, 20, 18, 0))).toBe(1);
  });
  it("ignores ended promos and non-multipliers", () => {
    expect(activeMultiplier([{ ...promo, endsAt: "2026-10-10T00:00:00Z" }], tue)).toBe(1);
    expect(activeMultiplier([{ ...promo, kind: "offer" }], tue)).toBe(1);
  });
});

describe("success card copy", () => {
  it("stamps: 'Added 1 stamp', '9 / 10', next reward", () => {
    const v = successView({ program: stamps, pointsEarned: 1, balance: 9, nextReward: { name: "Free drink", pointsNeeded: 1 }, firstName: "Alex" });
    expect(v.title).toBe("Added 1 stamp");
    expect(v.hero).toBe("9 / 10");
    expect(v.next).toBe("1 more for a free drink");
    expect(v.announcement).toContain("Alex now has 9 stamps");
  });
  it("points: 'Awarded 12 pts', '282 pts'", () => {
    const v = successView({ program: perDollar, pointsEarned: 12, balance: 282, nextReward: { name: "Free tire rotation", pointsNeeded: 118 } });
    expect(v.title).toBe("Awarded 12 pts");
    expect(v.hero).toBe("282 pts");
    expect(v.next).toBe("118 pts to Free tire rotation");
  });
  it("reward ready wins over next reward", () => {
    const v = successView({ program: stamps, pointsEarned: 1, balance: 10, rewardsAvailable: [{ name: "Free drink" }], nextReward: null });
    expect(v.rewardReady).toBe(true);
    expect(v.next).toBe("Reward ready: free drink");
  });
  it("offline: '~9 / 10' and unknown balance", () => {
    expect(successView({ program: stamps, pointsEarned: 1, balance: 9, offline: true }).hero).toBe("~9 / 10");
    const unknown = successView({ program: stamps, pointsEarned: 1, balance: null, offline: true });
    expect(unknown.hero).toBe("+1");
    // The card's "Saved. Sends when you're back online." line covers it; no second sentence.
    expect(unknown.next).toBeNull();
    expect(unknown.count).toEqual({ from: 0, to: 1 });
  });
});

describe("undo countdown and cooldown", () => {
  it("counts down 10 → 0", () => {
    expect(undoSecondsLeft(0, 0)).toBe(10);
    expect(undoSecondsLeft(0, 1500)).toBe(9);
    expect(undoSecondsLeft(0, 9_999)).toBe(1);
    expect(undoSecondsLeft(0, 10_000)).toBe(0);
    expect(undoSecondsLeft(0, 60_000)).toBe(0);
  });
  it("warns when the same customer earned < 2 min ago", () => {
    const now = Date.parse("2026-10-21T15:00:00Z");
    expect(cooldownWarning({ name: "Alex Chen", lastVisitAt: "2026-10-21T14:59:00Z" }, stamps, now)).toBe("Alex got a stamp 1 min ago. Add another only for a new visit.");
    expect(cooldownWarning({ name: "Alex Chen", lastVisitAt: "2026-10-21T14:50:00Z" }, stamps, now)).toBeNull();
  });
});

describe("scan classification", () => {
  it("member QR payload", () => expect(classifyScan("LL:K7QX2M9P")).toEqual({ kind: "member", memberCode: "K7QX2M9P" }));
  it("typed member code", () => expect(classifyScan("k7qx2m9p")).toEqual({ kind: "member", memberCode: "K7QX2M9P" }));
  it("app redeem code", () => expect(classifyScan("7kq2xm")).toEqual({ kind: "redeem", code: "7KQ2XM" }));
  it("phone", () => expect(classifyScan("+1 (416) 555-0123")).toEqual({ kind: "phone", digits: "4165550123" }));
  it("junk", () => expect(classifyScan("https://example.com")).toEqual({ kind: "invalid" }));
  it("normalises typed codes to the safe alphabet", () => {
    expect(normalizeRedeemInput("k7 4q")).toBe("K74Q");
    expect(normalizeRedeemInput("O0I1L")).toBe("");
    expect(groupCode("K74Q")).toBe("K7 4Q");
  });
});

describe("queue decision", () => {
  it("queues offline, timeouts and 5xx; not 4xx", () => {
    expect(shouldQueueAward({ status: 0, code: "network" })).toBe(true);
    expect(shouldQueueAward({ status: 503, code: "internal" })).toBe(true);
    expect(shouldQueueAward({ status: 409, code: "cooldown" })).toBe(false);
    expect(shouldQueueAward({ status: 400, code: "bad_request" })).toBe(false);
  });
});

describe("counter flow reducer (≤ 2 taps after identification)", () => {
  const run = (s: CounterState, ...keys: string[]) => keys.reduce((acc, key) => counterReducer(acc, { type: "key", key }), s);

  it("10 digits → lookup → found member → award → success", () => {
    let s = run(initialCounterState, ..."4165550123".split(""));
    expect(s).toMatchObject({ step: "entry", digits: "4165550123" });
    s = counterReducer(s, { type: "lookup" });
    expect(s).toMatchObject({ step: "lookingUp", query: "+14165550123" });
    s = counterReducer(s, { type: "lookupResult", digits: "4165550123", res: { matchedBy: "phone", items: [member()], normalizedPhone: null } });
    expect(s.step).toBe("customer");
    // tap 1: award
    s = counterReducer(s, { type: "submit" });
    expect(s).toMatchObject({ step: "customer", submitting: true });
    const view = successView({ program: stamps, pointsEarned: 1, balance: 9 });
    s = counterReducer(s, { type: "awarded", view, customer: { kind: "member", member: member() }, transactionId: "t1", queuedKey: null, at: 0 });
    expect(s).toMatchObject({ step: "success", transactionId: "t1" });
    // any keypad press returns to the keypad
    s = counterReducer(s, { type: "key", key: "6" });
    expect(s).toEqual({ step: "entry", digits: "6", error: null });
  });

  it("caps entry at 10 digits; back and clear", () => {
    let s = run(initialCounterState, ..."41655501239".split(""));
    expect(s).toMatchObject({ digits: "4165550123" });
    s = run(s, "back");
    expect(s).toMatchObject({ digits: "416555012" });
    s = run(s, "clear");
    expect(s).toMatchObject({ digits: "" });
  });

  it("invalid number shows the inline error", () => {
    const s = counterReducer(run(initialCounterState, ..."41655".split("")), { type: "lookup" });
    expect(s).toMatchObject({ step: "entry", error: "Check the number. It needs 10 digits." });
  });

  it("last-4 search shows up to 5 matches to pick from", () => {
    let s = counterReducer(run(initialCounterState, ..."0123".split("")), { type: "lookup" });
    expect(s).toMatchObject({ step: "lookingUp", query: "0123" });
    const items = Array.from({ length: 7 }, (_, i) => member({ memberId: `m${i}` }));
    s = counterReducer(s, { type: "lookupResult", digits: "0123", res: { matchedBy: "last4", items, normalizedPhone: null } });
    expect(s.step).toBe("pick");
    if (s.step === "pick") expect(s.matches).toHaveLength(5);
    s = counterReducer(s, { type: "pick", member: items[2]! });
    expect(s).toMatchObject({ step: "customer", customer: { kind: "member" } });
  });

  it("unknown phone → New customer panel with 'Add and award'", () => {
    const s = counterReducer({ step: "lookingUp", digits: "6475550199", query: "+16475550199" }, {
      type: "lookupResult",
      digits: "6475550199",
      res: { matchedBy: "phone", items: [], normalizedPhone: "+16475550199" },
    });
    expect(s).toMatchObject({ step: "customer", customer: { kind: "new", phone: "+16475550199" } });
    if (s.step === "customer") expect(awardRef(s.customer)).toEqual({ phone: "+16475550199" });
  });

  it("per-dollar: keypad switches to amount entry once identified", () => {
    let s: CounterState = { step: "customer", customer: { kind: "member", member: member() }, amountCents: 0, noEarn: false, error: null, submitting: false };
    s = run(s, "1", "1", "8", "0");
    expect(s).toMatchObject({ amountCents: 1180 });
    s = counterReducer(s, { type: "toggleNoEarn" });
    expect(s).toMatchObject({ noEarn: true });
  });

  it("offline lookup still identifies by phone", () => {
    const s = counterReducer({ step: "lookingUp", digits: "4165550123", query: "+14165550123" }, { type: "lookupOffline", phone: "+14165550123", label: "...0123" });
    expect(s).toMatchObject({ step: "customer", customer: { kind: "offline", phone: "+14165550123" } });
    if (s.step === "customer") expect(awardRef(s.customer)).toEqual({ phone: "+14165550123" });
  });

  it("award error keeps the panel", () => {
    const s = counterReducer({ step: "customer", customer: { kind: "member", member: member() }, amountCents: 0, noEarn: false, error: null, submitting: true }, { type: "awardError", message: "Alex got a stamp 1 min ago." });
    expect(s).toMatchObject({ step: "customer", submitting: false, error: "Alex got a stamp 1 min ago." });
  });
});

describe("formatting", () => {
  it("formats points with terminology", () => {
    expect(formatPts(1, "points")).toBe("1 pt");
    expect(formatPts(1250, "points")).toBe("1,250 pts");
    expect(formatPts(8, "stamps")).toBe("8 stamps");
    expect(formatPts(1, "stars")).toBe("1 star");
  });
  it("locked reward copy", () => {
    expect(lockedRewardCopy(12, "points")).toBe("12 pts to go");
    expect(lockedRewardCopy(1, "stamps")).toBe("1 stamp to go");
  });
  it("short names", () => {
    expect(shortName("Alex Chen")).toBe("Alex C.");
    expect(shortName(null)).toBe("Customer");
  });
});

describe("award quantity (+2 / +3 chips)", () => {
  it("offers chips for visit and stamp programs only", () => {
    expect(quantityChips({ earnType: "stamps" })).toEqual([2, 3]);
    expect(quantityChips({ earnType: "per_visit" })).toEqual([2, 3]);
    expect(quantityChips({ earnType: "per_dollar" })).toEqual([]);
    expect(quantityChips(null)).toEqual([]);
  });
  it("sends quantity only when > 1, capped at 10, never for per-dollar", () => {
    expect(awardQuantity({ earnType: "stamps" }, 1)).toEqual({});
    expect(awardQuantity({ earnType: "stamps" }, 3)).toEqual({ quantity: 3 });
    expect(awardQuantity({ earnType: "per_visit" }, 25)).toEqual({ quantity: 10 });
    expect(awardQuantity({ earnType: "per_dollar" }, 3)).toEqual({});
  });
  it("a balance past a full card reads as a count", () => {
    const stamps = { earnType: "stamps" as const, terminology: "stamps", pointsPerDollar: 0, pointsPerVisit: 1, minSpendCents: 0, stampGoal: 10 };
    expect(successView({ program: stamps, pointsEarned: 2, balance: 14 }).hero).toBe("14 stamps");
    expect(successView({ program: stamps, pointsEarned: 2, balance: 10 }).hero).toBe("10 / 10");
  });
});

describe("scan first: what a lookup does", () => {
  const auto: CounterProgram = { ...stamps, counterAutoStamp: true };
  const res = (items: staffApi.MemberSummaryDto[], over: Partial<staffApi.LookupResponse> = {}): staffApi.LookupResponse => ({ matchedBy: "last4", items, normalizedPhone: null, ...over });
  const look = (r: staffApi.LookupResponse, program: CounterProgram | null) => counterReducer({ step: "lookingUp", digits: "1034", query: "1034" }, { type: "lookupResult", res: r, digits: "1034", program });

  it("decides per member: reward ready never auto-stamps; auto-stamp only for stamp and visit programs", () => {
    expect(decideMember(member({ balance: 4 }), auto)).toBe("stamp");
    expect(decideMember(member({ balance: 4 }), stamps)).toBe("confirm");
    expect(decideMember(member({ balance: 4 }), { ...perDollar, counterAutoStamp: true })).toBe("confirm");
    expect(decideMember(member({ balance: 10 }), auto)).toBe("reward");
    expect(decideMember(member({ balance: 3, rewardsAffordable: [{ id: "r", name: "Free drink", pointsCost: 3 }] }), auto)).toBe("reward");
    expect(decideMember(member({ balance: 4 }), { ...perVisit, counterAutoStamp: true })).toBe("stamp");
    expect(isRewardReady(member({ balance: 9 }), stamps)).toBe(false);
    expect(isRewardReady(member({ balance: 10 }), stamps)).toBe(true);
  });

  it("one match with Stamp on scan on goes straight to stamping (no Find, no confirm)", () => {
    expect(look(res([member({ balance: 4 })]), auto)).toMatchObject({ step: "stamping", member: { balance: 4 } });
    expect(look(res([member({ balance: 4 })]), stamps).step).toBe("customer");
    expect(look(res([member({ balance: 11 })]), auto).step).toBe("reward");
    // A scanned card (member_code) decides the same way.
    expect(look(res([member({ balance: 4 })], { matchedBy: "member_code" }), auto).step).toBe("stamping");
  });

  it("two matches show the list; a tap on a row then stamps, redeems or confirms", () => {
    const two = [member({ memberId: "a", balance: 7 }), member({ memberId: "b", balance: 3 })];
    const s = look(res(two), auto);
    expect(s).toMatchObject({ step: "pick" });
    expect(counterReducer(s, { type: "pick", member: two[1]!, program: auto })).toMatchObject({ step: "stamping", member: { memberId: "b" } });
    expect(counterReducer(s, { type: "pick", member: two[0]!, program: stamps }).step).toBe("customer");
    expect(counterReducer(s, { type: "pick", member: member({ balance: 12 }), program: auto }).step).toBe("reward");
    // Older callers (no program) keep the confirm panel.
    expect(counterReducer(s, { type: "pick", member: two[0]! }).step).toBe("customer");
  });

  it("no one ends in those digits says so, and an unknown phone still offers Add and award", () => {
    expect(look(res([]), auto)).toEqual({ step: "nomatch", digits: "1034" });
    expect(look(res([], { matchedBy: "phone", normalizedPhone: "+16475550199" }), auto)).toMatchObject({ step: "customer", customer: { kind: "new" } });
    expect(counterReducer({ step: "nomatch", digits: "1034" }, { type: "toEntry" })).toEqual({ step: "entry", digits: "", error: null });
  });

  it("without a program the older flow is unchanged (last-4 always lists)", () => {
    expect(counterReducer({ step: "lookingUp", digits: "1034", query: "1034" }, { type: "lookupResult", res: res([member()]), digits: "1034" }).step).toBe("pick");
  });
});

describe("scan-first copy", () => {
  it("matches the frames", () => {
    expect(matchesHeading(2, "1034")).toBe("Two members end in 1034");
    expect(visitThisMonth(5)).toBe("5th visit this month");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(22)).toBe("22nd");
    expect(stampsLeft(2, "Free drink")).toBe("2 more for a free drink");
    expect(stampsLeft(0, "Free drink")).toBe("Free drink ready");
    expect(maskedRow("(647) ***-1034")).toBe("(647) ···-1034");
    const now = new Date("2026-10-23T15:00:00Z");
    expect(cameInText("2026-10-22T15:00:00Z", now)).toBe("in yesterday");
    expect(cameInText("2026-10-09T15:00:00Z", now)).toBe("in 2 weeks ago");
    expect(carryOverLine("Fatima Tremblay", 11, 10, "stamps")).toBe("Fatima has 11 stamps. 1 carries over after redeeming.");
    expect(carryOverLine(null, 10, 10, "stamps")).toBe("They have 10 stamps. A fresh card starts after redeeming.");
  });
});
