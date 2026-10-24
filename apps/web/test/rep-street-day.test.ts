import { describe, expect, it } from "vitest";
import type { repApi } from "@ll/shared";
import { applyOutcome, enqueue, flushQueue, loadQueue, newClientId, saveQueue, type QueuedOutcome } from "@/lib/rep/outcomeQueue";
import { pitchSteps, proofHighlights } from "@/lib/rep/pitch";

const q = (id: string, leadId = "l1", outcome: repApi.LeadOutcome = "not_in"): QueuedOutcome => ({ clientId: id, leadId, outcome });
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("outcome queue", () => {
  it("makes unique client ids of at least 8 characters", () => {
    const a = newClientId(1, () => 0.1);
    const b = newClientId(1, () => 0.2);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
  it("round trips through storage and ignores junk", () => {
    const s = mem();
    saveQueue([q("web-aaaa-1")], s);
    expect(loadQueue(s)).toEqual([q("web-aaaa-1")]);
    s.setItem("ll.rep.outcomeQueue.v1", "not json");
    expect(loadQueue(s)).toEqual([]);
    s.setItem("ll.rep.outcomeQueue.v1", JSON.stringify([{ nope: 1 }, q("web-bbbb-2")]));
    expect(loadQueue(s)).toEqual([q("web-bbbb-2")]);
    expect(loadQueue(null)).toEqual([]);
  });
  it("never queues the same client id twice", () => {
    expect(enqueue([q("a")], q("a"))).toHaveLength(1);
    expect(enqueue([q("a")], q("b"))).toHaveLength(2);
  });
  it("flushes in batches, keeps what a network error did not confirm, drops what the server refuses", async () => {
    const items = [q("a1"), q("a2"), q("a3"), q("a4", "gone")];
    const ok = await flushQueue(items, async (chunk) => ({ results: chunk.map((c) => ({ clientId: c.clientId, leadId: c.leadId, status: c.leadId === "gone" ? ("not_found" as const) : ("recorded" as const) })) }), 2);
    expect(ok).toMatchObject({ sent: 3, failed: false, remaining: [] });
    expect(ok.confirmed).toEqual(["a1", "a2", "a3", "a4"]);
    expect(ok.dropped.map((d) => d.clientId)).toEqual(["a4"]);
    let calls = 0;
    const flaky = await flushQueue(items, async (chunk) => {
      if (++calls === 2) throw new Error("offline");
      return { results: chunk.map((c) => ({ clientId: c.clientId, leadId: c.leadId, status: "duplicate" as const })) };
    }, 2);
    expect(flaky.failed).toBe(true);
    expect(flaky.sent).toBe(2);
    expect(flaky.confirmed).toEqual(["a1", "a2"]);
    expect(flaky.remaining.map((r) => r.clientId)).toEqual(["a3", "a4"]);
  });
  it("applies an outcome to the cached day: the stop moves to done and the counts follow", () => {
    const stop = (id: string, order: number | null, todayOutcome: repApi.LeadOutcome | null = null) => ({ id, order, todayOutcome, stage: "new" }) as unknown as repApi.StreetStop;
    const day = { area: null, generatedAt: "", stops: [stop("a", 1), stop("b", 2), stop("c", null, "come_back")], counts: { total: 3, visited: 1, signedUp: 0, setupCalls: 0, comeBack: 1, notInterested: 0, notIn: 0, left: 2 } } as repApi.StreetDay;
    const next = applyOutcome(day, { leadId: "a", outcome: "not_interested" });
    expect(next.stops.map((s) => [s.id, s.order, s.todayOutcome])).toEqual([["b", 1, null], ["c", null, "come_back"], ["a", null, "not_interested"]]);
    expect(next.counts).toMatchObject({ visited: 2, notInterested: 1, left: 1, comeBack: 1 });
    expect(next.stops.at(-1)!.stage).toBe("lost");
    expect(applyOutcome(next, { leadId: "a", outcome: "not_in" })).toBe(next);
  });
});

describe("pitch", () => {
  const proof = (o: Partial<repApi.PitchProof> = {}): repApi.PitchProof => ({ area: { id: "1", name: "the Danforth" }, shopsLive: 12, customers: 840, multiShopPct: 0.31, visitsLast7Days: 310, topShops: [], network: { shopsLive: 40, customers: 3200 }, ...o });
  it("says what the numbers support", () => {
    const steps = pitchSteps(proof(), { name: "Taj Sweets" });
    expect(steps.map((s) => s.key)).toEqual(["problem", "proof", "offer"]);
    expect(steps[0]!.say).toContain("Taj Sweets");
    expect(steps[1]!.say).toContain("12 shops in the Danforth");
    expect(steps[1]!.say).toContain("31%");
    expect(steps[1]!.say).toContain("310 visits");
  });
  it("never claims a street effect with fewer than three shops", () => {
    const thin = pitchSteps(proof({ shopsLive: 1, customers: 20 }), { name: "X" })[1]!.say;
    expect(thin).toContain("40 shops across Toronto");
    expect(thin).toContain("the Danforth is next");
    expect(thin).not.toContain("1 shop");
    expect(pitchSteps(proof({ shopsLive: 1, customers: 20, network: { shopsLive: 2, customers: 30 } }), { name: "X" })[1]!.say).toContain("1 shop on the network so far");
    expect(pitchSteps(proof({ shopsLive: 0, network: { shopsLive: 0, customers: 0 } }), { name: "X" })[1]!.say).toContain("opening this area now");
    expect(pitchSteps(null, { name: "X" })[1]!.say).toContain("opening this area now");
  });
  it("lists up to three proof numbers", () => {
    expect(proofHighlights(proof())).toEqual([{ label: "shops live on the Danforth", value: "12" }, { label: "customers joined", value: "840" }, { label: "use 2+ shops", value: "31%" }]);
    expect(proofHighlights(proof({ shopsLive: 0, customers: 0 }))[0]).toEqual({ label: "shops live in Toronto", value: "40" });
    expect(proofHighlights(null)).toEqual([]);
  });
});
