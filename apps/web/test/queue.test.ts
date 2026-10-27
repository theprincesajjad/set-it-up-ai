import { describe, expect, it } from "vitest";
import { chairAction, entryMeta, modelLabel, nextFor, waitLabel, weekRange } from "@/lib/dashboard/queue";

const chair = (o: Partial<Parameters<typeof chairAction>[0]>) => ({ staffId: "a", name: "Marcus", takesWalkIns: true, state: "free" as const, doing: null, entryId: null, appointmentId: null, minutesIn: null, waitingForThem: 0, ...o });
const entry = (o: Record<string, unknown>) => ({ id: "e", position: 1, name: "Omar", withName: null, serviceName: "Cut", durationMin: 25, requestedStaffId: null, requestedStaffName: null, status: "waiting", source: "join", joinedAt: "", calledAt: null, calledStaffId: null, waitedMin: 0, textedNext: false, skips: 0, appointmentId: null, partyId: null, ...o }) as Parameters<typeof entryMeta>[0];

describe("queue helpers", () => {
  it("picks one action per chair", () => {
    expect(chairAction(chair({}), true)).toEqual({ kind: "call-next", label: "Call next" });
    expect(chairAction(chair({}), false).kind).toBe("none");
    expect(chairAction(chair({ state: "busy", entryId: "x" }), true).kind).toBe("done");
    expect(chairAction(chair({ state: "called", entryId: "x" }), true).kind).toBe("start");
    expect(chairAction(chair({ state: "busy" }), true).label).toBe("With an appointment");
    expect(chairAction(chair({ takesWalkIns: false, state: "away" }), true).label).toBe("Not taking walk-ins");
  });
  it("calls the barber's own people first, then anyone", () => {
    const w = [entry({ id: "1", requestedStaffId: "b" }), entry({ id: "2" }), entry({ id: "3", requestedStaffId: "a" })];
    expect(nextFor("a", w)?.id).toBe("3");
    expect(nextFor("c", w)?.id).toBe("2");
    expect(nextFor("a", [])).toBeNull();
  });
  it("words", () => {
    expect(entryMeta(entry({ requestedStaffName: "Marcus" }))).toBe("Cut · Marcus (asked)");
    expect(entryMeta(entry({ withName: "Sajjad", serviceName: "Kids' cut" }))).toBe("Kids' cut · with Sajjad · Any barber");
    expect(waitLabel(null)).toBe("No chair taking walk-ins");
    expect(waitLabel(25)).toBe("about 25 min");
    expect(modelLabel("commission", 4000)).toBe("Commission 40%");
    expect(modelLabel("chair_rent")).toBe("Chair rental");
  });
  it("finds Monday to Sunday", () => {
    expect(weekRange("2026-11-04")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(weekRange("2026-11-08")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(weekRange("2026-11-04", -1)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
  });
});
