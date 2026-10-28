import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatNumber, formatTime, t as translate, type FeatureKey, type classesApi, type reportsApi, type restaurantApi, type serviceApi } from "@ll/shared";
import { ageLabel, appointmentNeeds, appointmentUp, deltaVs, headerSecondary, loyaltyNeeds, quickActions, restaurantNeeds, restaurantNumbers, serviceNeeds, studioNeeds, studioNumbers, studioUp, todayFamily, type Fmt } from "@/lib/dashboard/today";

const L = "en" as const;
const f: Fmt = {
  t: (k, v) => translate(L, k, v),
  number: (n) => formatNumber(L, n),
  money: (c) => formatCurrency(L, c),
  time: (d) => formatTime(L, d),
  weekday: (d) => formatDate(L, d, { weekday: "long" }),
  dayShort: (d) => formatDate(L, d, { weekday: "short", day: "numeric" }, "UTC"),
  clock: (hhmm) => hhmm,
};
const NOW = Date.parse("2026-10-28T15:00:00Z"); // 11:00 in Toronto

describe("today family", () => {
  const on = (...k: FeatureKey[]) => new Set<FeatureKey>(k);
  it("picks the layout from the trade's own features", () => {
    expect(todayFamily("cafe", on())).toBe("loyalty");
    expect(todayFamily("restaurant", on("restaurant.kds"))).toBe("restaurant");
    expect(todayFamily("fitness", on("booking.classes"), { vertical: "fitness" })).toBe("studio");
    expect(todayFamily("salon", on("booking.appointments"), { vertical: "salon" })).toBe("appointments");
    expect(todayFamily("barber", on("booking.walkin_queue"), { vertical: "barber" })).toBe("appointments");
    expect(todayFamily("repair_electronics", on("service.tickets"), { vertical: "repair_electronics" })).toBe("service");
    expect(todayFamily("grocery", on())).toBe("loyalty");
  });
});

describe("small formats", () => {
  it("says how long something has waited", () => {
    expect(ageLabel(NOW, NOW, f.t)).toBe("now");
    expect(ageLabel(NOW - 6 * 60_000, NOW, f.t)).toBe("6 min");
    expect(ageLabel(NOW - 3 * 3_600_000, NOW, f.t)).toBe("3 h");
    expect(ageLabel(NOW - 2 * 86_400_000, NOW, f.t)).toBe("2 d");
    expect(ageLabel(NOW - 42 * 86_400_000, NOW, f.t)).toBe("6 wk");
  });
  it("compares with the same weekday, in counts on a small base and in percent on a large one", () => {
    expect(deltaVs(5, 3, "Wednesday", f)).toEqual({ text: "+2 vs last Wednesday", good: true });
    expect(deltaVs(86, 77, "Wednesday", f)).toEqual({ text: "+12% vs last Wednesday", good: true });
    expect(deltaVs(68, 80, "Wednesday", f)).toEqual({ text: "−15% vs last Wednesday", good: false });
    expect(deltaVs(9, 9, "Wednesday", f)).toEqual({ text: "Same as last Wednesday", good: null });
    expect(deltaVs(4, null, "Wednesday", f)).toBeNull();
    expect(deltaVs(0, 0, "Wednesday", f)).toBeNull();
  });
});

const today = (over: Partial<reportsApi.TodayReportDto> = {}): reportsApi.TodayReportDto =>
  ({
    today: { visits: 86, typicalVisitsFullDay: 120, typicalVisitsSoFar: 77, newMembers: 3, newViaQr: 2, stampsGiven: 142, redemptions: 9, regularsSeen: 5, regularsTotal: 20 },
    rewardsWaiting: { count: 2, goal: 10, members: [] },
    slipping: { count: 4, canText: 3, members: [] },
    promoWindow: null,
    ...over,
  }) as reportsApi.TodayReportDto;

describe("loyalty needs you", () => {
  const input = { today: today(), orders: null, onboarding: null, canMessage: true, terminology: "stamps" };
  it("says who must act: rewards wait on a customer, slipping regulars are due soon", () => {
    const rows = loyaltyNeeds(input, f, NOW);
    expect(rows.map((r) => [r.key, r.tone])).toEqual([["rewards", "info"], ["slipping", "warning"]]);
    expect(rows[1]!.href).toBe("/messages/new?segment=slipping");
    expect(rows[1]!.sub).toBe("3 agreed to texts");
  });
  it("sends a shop that cannot text to the customers list instead", () => {
    expect(loyaltyNeeds({ ...input, canMessage: false }, f, NOW)[1]!.href).toBe("/customers?segment=slipping");
  });
  it("puts new pre-orders first, in the shop's colour, with the oldest one named", () => {
    const orders = [
      { id: "a", number: 212, status: "pending", createdAt: new Date(NOW - 6 * 60_000).toISOString(), pickupAt: "2026-10-28T12:40:00Z", customer: { name: "Priya N.", phone: null }, items: [] },
      { id: "b", number: 213, status: "pending", createdAt: new Date(NOW - 2 * 60_000).toISOString(), pickupAt: null, customer: { name: "Marcus L.", phone: null }, items: [] },
      { id: "c", number: 214, status: "accepted", createdAt: new Date(NOW - 60 * 60_000).toISOString(), pickupAt: null, items: [] },
    ] as never;
    const [first] = loyaltyNeeds({ ...input, orders }, f, NOW);
    expect(first).toMatchObject({ key: "orders", tone: "points", title: "2 new pre-orders", age: "6 min", href: "/orders" });
    expect(first!.sub).toContain("Priya N.");
  });
  it("is empty when nothing needs the shop", () => {
    expect(loyaltyNeeds({ ...input, today: today({ rewardsWaiting: { count: 0, goal: 10, members: [] }, slipping: { count: 0, canText: 0, members: [] } }) }, f, NOW)).toEqual([]);
  });
});

describe("restaurant", () => {
  const home = {
    today: "2026-10-28", closesAt: "11 pm", orders: { new: 4, preparing: 2, ready: 1, late: 2, open: 7 }, avgWaitMin: 18, quotedWaitMin: 20, salesTodayCents: 231_000, salesVsLastSameWeekdayPct: 4,
    directSavings: { estimate: true, periodDays: 30, directOrders: 10, avgTicketCents: 3000, assumedFeeBps: 2500, cents: 7500 },
    channels: [], comingUp: [{ date: "2026-10-30", kind: "catering", title: "Office lunch", sub: "25 guests", href: "/restaurant/catering" }],
    needsYou: [{ kind: "new_orders", count: 4, text: "4 new orders waiting", href: "/orders", tone: "accent" }, { kind: "whatsapp_payment", count: 1, text: "Waiting on the Malik family", href: "/restaurant/whatsapp", tone: "info" }],
    busy: { on: false, addMinutes: 0, until: null, quotedWaitMin: 20, recent: [] },
  } as unknown as restaurantApi.RestaurantHomeResponse;
  it("maps the server's rows to the four tones", () => {
    expect(restaurantNeeds(home).map((r) => r.tone)).toEqual(["points", "info"]);
  });
  it("shows four real numbers with the order split", () => {
    const n = restaurantNumbers(home, f);
    expect(n.map((x) => x.label)).toEqual(["Open orders", "Average wait", "Sales today", "Commission avoided"]);
    expect(n[0]!.caption).toBe("4 new, 2 cooking, 1 ready");
    expect(n[2]!.delta).toEqual({ good: true, text: "+4% vs last Wednesday" });
  });
});

describe("appointments", () => {
  const board = { stats: { waiting: 3, estimateMin: 25, servedToday: 3 }, waiting: [{ name: "Jay", waitedMin: 0 }] } as never;
  const appt = (id: string, startsAt: string, status: string, name: string) => ({ id, startsAt, endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(), status, customer: { name }, items: [{ name: "Skin fade" }], staffName: "Jay", arrivedAt: null });
  it("leads with the next walk-in", () => {
    const rows = appointmentNeeds({ appointments: [], board, today: null }, f, NOW);
    expect(rows[0]).toMatchObject({ key: "queue", tone: "points", title: "Jay is next in the walk-in line", sub: "3 waiting · about 25 min", age: "now" });
  });
  it("flags a client who has not arrived ten minutes after their time, and lists what is next", () => {
    const appointments = [appt("1", new Date(NOW - 20 * 60_000).toISOString(), "booked", "Aiden K."), appt("2", new Date(NOW + 30 * 60_000).toISOString(), "booked", "Raj P.")] as never;
    expect(appointmentNeeds({ appointments, board: null, today: null }, f, NOW).map((r) => r.key)).toEqual(["late"]);
    expect(appointmentUp({ appointments, board: null, today: null }, f, NOW).map((r) => r.title)).toEqual(["Raj P. · Skin fade"]);
  });
});

describe("studio", () => {
  const session = (id: string, over: Partial<classesApi.ClassSessionDto>) => ({ id, name: "Vinyasa", instructorName: "Maya", startsAt: new Date(NOW + 2 * 3_600_000).toISOString(), endsAt: new Date(NOW + 3 * 3_600_000).toISOString(), capacity: 16, booked: 16, waitlisted: 3, status: "scheduled", ...over }) as classesApi.ClassSessionDto;
  it("says a full class with a waitlist needs the shop", () => {
    expect(studioNeeds([session("a", {})], f, NOW)[0]).toMatchObject({ tone: "points", sub: "3 on the waitlist" });
  });
  it("counts class fill from booked and capacity, and lists classes in time order", () => {
    const list = [session("a", {}), session("b", { booked: 8, waitlisted: 0, startsAt: new Date(NOW + 3_600_000).toISOString() })];
    expect(studioNumbers(list, null, f)[1]).toMatchObject({ label: "Class fill", value: "75%" });
    expect(studioUp(list, f, NOW).map((r) => r.sub)).toEqual(["8 of 16 booked", "16 of 16, full"]);
  });
});

describe("service", () => {
  it("turns ticket counts into rows", () => {
    const s = { needsYou: 2, waitingOnCustomer: 0, dueToday: 3, overdue: 1, readyUncollected: 4, oldestReadyDays: 6, openQuoteValueCents: 12_000, openQuoteCount: 1, lienEligible: 0 } as serviceApi.TicketSummaryResponse;
    expect(serviceNeeds(s, f).map((r) => [r.key, r.tone])).toEqual([["needs", "points"], ["overdue", "warning"], ["quotes", "info"], ["ready", "info"]]);
  });
});

describe("quick actions and the header", () => {
  const can = { promos: true, messages: true, orders: true, kitchen: true, whatsapp: true, phoneOrders: true, walkIn: true, calendar: true, classes: true, tickets: true };
  it("gives every trade at most four tiles, and never one for a page it cannot open", () => {
    for (const fam of ["loyalty", "restaurant", "appointments", "studio", "service"] as const) {
      const full = quickActions(fam, f, can);
      expect(full.length, fam).toBe(4);
      const none = quickActions(fam, f, { ...can, promos: false, messages: false, orders: false, kitchen: false, whatsapp: false, walkIn: false, calendar: false, classes: false, tickets: false });
      expect(none.length, fam).toBeLessThanOrEqual(4);
      expect(none.every((a) => !["/promos/new", "/messages/new", "/restaurant/kitchen", "/queue", "/calendar", "/classes/door", "/tickets/new"].includes(a.href)), fam).toBe(true);
    }
  });
  it("has one secondary action per trade", () => {
    expect(headerSecondary("restaurant", { kitchen: true, calendar: false, classes: false }).href).toBe("/restaurant/kitchen");
    expect(headerSecondary("loyalty", { kitchen: false, calendar: false, classes: false }).href).toBe("/locations/kit");
  });
});
