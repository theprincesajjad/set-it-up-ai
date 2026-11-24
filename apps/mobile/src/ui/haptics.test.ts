import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const platform = { OS: "ios" as string };

vi.mock("react-native", () => ({ Platform: platform }));
vi.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  selectionAsync: () => {
    calls.push("selection");
    return Promise.resolve();
  },
  impactAsync: (s: string) => {
    calls.push(`impact:${s}`);
    return Promise.resolve();
  },
  notificationAsync: (t: string) => {
    calls.push(`notification:${t}`);
    return t === "error" ? Promise.reject(new Error("no engine")) : Promise.resolve();
  },
}));

const { haptic, setHapticsEnabled, hapticsEnabled, resetHapticsForTest, OUTCOME_DEDUPE_MS } = await import("./haptics");

describe("haptic", () => {
  beforeEach(() => {
    calls.length = 0;
    platform.OS = "ios";
    resetHapticsForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("maps each kind to one native call", () => {
    haptic.select();
    haptic.tap();
    haptic.success();
    haptic.warning();
    haptic.error();
    expect(calls).toEqual(["selection", "impact:light", "notification:success", "notification:warning", "notification:error"]);
  });

  it("never throws when the native call rejects", async () => {
    expect(() => haptic.error()).not.toThrow();
    await Promise.resolve();
  });

  it("does nothing on web", () => {
    platform.OS = "web";
    expect(haptic.success()).toBe(false);
    haptic.tap();
    expect(calls).toEqual([]);
  });

  it("turns off and back on with one switch", () => {
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
    haptic.tap();
    haptic.success();
    expect(calls).toEqual([]);
    setHapticsEnabled(true);
    haptic.tap();
    expect(calls).toEqual(["impact:light"]);
  });

  it("buzzes once when a screen and its toast report the same outcome", () => {
    expect(haptic.error()).toBe(true);
    expect(haptic.error()).toBe(false);
    vi.advanceTimersByTime(OUTCOME_DEDUPE_MS);
    expect(haptic.error()).toBe(true);
    expect(calls).toEqual(["notification:error", "notification:error"]);
  });

  it("does not dedupe different outcomes or taps", () => {
    haptic.success();
    haptic.error();
    haptic.tap();
    haptic.tap();
    expect(calls).toEqual(["notification:success", "notification:error", "impact:light", "impact:light"]);
  });
});
