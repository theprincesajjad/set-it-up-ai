/** Pre-registered landing tests (experiments.ts; ab-spec §2) and the sticky draw both apps use. */
import { describe, expect, it } from "vitest";
import {
  AID_PATTERN,
  EXPERIMENTS,
  activeExperiment,
  drawArm,
  experimentById,
  experimentsNow,
  horizonFor,
  isRunning,
  parseVariantCookie,
  unitHash,
  variantCookie,
  type Experiment,
} from "../src/experiments.js";

const randomAid = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
};

describe("pre-registration", () => {
  it.each(EXPERIMENTS.map((e) => [e.id, e] as const))("%s: weights sum to 1, control is an arm, the horizon matches the arithmetic", (_id, e) => {
    expect(e.arms.reduce((s, a) => s + a.weight, 0)).toBeCloseTo(1, 9);
    expect(e.arms.map((a) => a.variant)).toContain("control");
    expect(new Set(e.arms.map((a) => a.variant)).size).toBe(e.arms.length);
    // value-props §3.3: 15.7 × p̄(1 − p̄) / δ² per arm, both arms; within 5% of what we registered.
    const n = horizonFor(e.baseline, e.mde);
    expect(Math.abs(e.horizonExposures - n) / n).toBeLessThanOrEqual(0.05);
    expect(e.alphaInterim).toBeLessThan(e.alphaFinal);
    expect(e.alphaInterim + e.alphaFinal).toBeLessThanOrEqual(0.0551);
    expect(e.interimAt).toBeGreaterThan(0);
    expect(e.interimAt).toBeLessThan(1);
    expect(Number.isNaN(new Date(e.startedAt).getTime())).toBe(false);
  });

  it("the sample-size table in value-props §3.3", () => {
    // Start submit 5% → 10%: 440 a arm, 880 both; link live 2.5% → 5%: about 910 an arm.
    expect(horizonFor(0.05, 1.0)).toBe(872);
    expect(horizonFor(0.025, 1.0) / 2).toBeCloseTo(910, -1);
    expect(horizonFor(0.05, 0.5) / 2).toBeCloseTo(1470, -1);
  });

  it("no two tests that can run at the same time share a page", () => {
    const overlaps = (a: Experiment, b: Experiment) => {
      const end = (e: Experiment) => (e.endedAt ? new Date(e.endedAt).getTime() : Infinity);
      return new Date(a.startedAt).getTime() < end(b) && new Date(b.startedAt).getTime() < end(a);
    };
    for (const a of EXPERIMENTS) for (const b of EXPERIMENTS) if (a !== b && overlaps(a, b)) expect(a.pages.filter((p) => b.pages.includes(p)), `${a.id} / ${b.id}`).toEqual([]);
    expect(new Set(EXPERIMENTS.map((e) => e.id)).size).toBe(EXPERIMENTS.length);
  });

  it("activeExperiment honours the start, the end and an admin stop", () => {
    const t1 = experimentById("t1-nails-lead")!;
    const before = new Date(new Date(t1.startedAt).getTime() - 1);
    const during = new Date(new Date(t1.startedAt).getTime() + 86_400_000);
    expect(activeExperiment("nail", before)).toBeUndefined();
    expect(activeExperiment("nail", during)?.id).toBe("t1-nails-lead");
    expect(activeExperiment("barber", during)?.id).toBe("t1-barber-lead");
    expect(activeExperiment("groom", during)).toBeUndefined();
    expect(activeExperiment("nail", during, ["t1-nails-lead"])).toBeUndefined();
    expect(isRunning({ ...t1, endedAt: during.toISOString() }, during)).toBe(false);
  });
});

describe("assignment", () => {
  const t1 = experimentById("t1-nails-lead")!;

  it("is sticky: the same anonymous id always draws the same arm", () => {
    for (let i = 0; i < 50; i++) {
      const aid = randomAid();
      expect(AID_PATTERN.test(aid)).toBe(true);
      const first = drawArm(t1, aid);
      for (let k = 0; k < 5; k++) expect(drawArm(t1, aid)).toBe(first);
    }
  });

  it("splits close to the weights: 10,000 ids land 50/50 within 2 points; 200 ids within 40–60", () => {
    const share = (n: number) => {
      let yours = 0;
      for (let i = 0; i < n; i++) if (drawArm(t1, randomAid()) === "yours") yours++;
      return yours / n;
    };
    expect(Math.abs(share(10_000) - 0.5)).toBeLessThan(0.02);
    // Acceptance 8.2. Binomial(200, 0.5) stays inside 40–60% with probability 0.995; five tries make a false failure ~1e-11.
    expect([0, 1, 2, 3, 4].some(() => Math.abs(share(200) - 0.5) <= 0.1)).toBe(true);
    // Uneven weights are honoured too.
    const skew: Experiment = { ...t1, arms: [{ variant: "control", weight: 0.8 }, { variant: "yours", weight: 0.2 }] };
    let c = 0;
    for (let i = 0; i < 10_000; i++) if (drawArm(skew, randomAid()) === "control") c++;
    expect(Math.abs(c / 10_000 - 0.8)).toBeLessThan(0.02);
  });

  it("draws independently per test (the nail and barber draws are not the same coin)", () => {
    const barber = experimentById("t1-barber-lead")!;
    let same = 0;
    for (let i = 0; i < 4000; i++) {
      const aid = randomAid();
      if ((drawArm(t1, aid) === "control") === (drawArm(barber, aid) === "control")) same++;
    }
    expect(Math.abs(same / 4000 - 0.5)).toBeLessThan(0.04);
  });

  it("unitHash is in [0, 1) and stable", () => {
    expect(unitHash("abc")).toBe(unitHash("abc"));
    for (const s of ["", "a", "t1-nails-lead:AAAAAAAAAAAAAAAAAAAAAA"]) {
      expect(unitHash(s)).toBeGreaterThanOrEqual(0);
      expect(unitHash(s)).toBeLessThan(1);
    }
  });

  it("reads and writes ll_v", () => {
    expect(variantCookie("t1-nails-lead", "yours")).toBe("t1-nails-lead:yours");
    expect(variantCookie(null, "dms")).toBe("none:dms");
    expect(parseVariantCookie("t1-nails-lead:yours")).toEqual({ experimentId: "t1-nails-lead", variant: "yours" });
    expect(parseVariantCookie("t1-nails-lead%3Ayours")).toEqual({ experimentId: "t1-nails-lead", variant: "yours" });
    expect(parseVariantCookie("none:dms")).toEqual({ experimentId: null, variant: "dms" });
    for (const bad of [null, "", "yours", ":yours", "t1:", "T1:Yours", "a:b:c", "%E0%A4%A", "x:<script>"]) expect(parseVariantCookie(bad), String(bad)).toBeNull();
  });

  it("the test clock moves only when enabled", () => {
    const real = new Date("2026-10-29T12:00:00Z");
    expect(experimentsNow(real, { enabled: false, env: "2026-11-15T00:00:00Z", header: "2026-11-16T00:00:00Z" })).toBe(real);
    expect(experimentsNow(real, { enabled: true, env: "2026-11-15T00:00:00Z" }).toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(experimentsNow(real, { enabled: true, env: "2026-11-15T00:00:00Z", header: "2026-11-16T00:00:00Z" }).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(experimentsNow(real, { enabled: true, header: "garbage" })).toBe(real);
  });
});
