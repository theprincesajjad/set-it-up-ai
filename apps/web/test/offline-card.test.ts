import { afterEach, describe, expect, it, vi } from "vitest";
import { OFFLINE_CARD_KEY, clearOfflineCard, saveOfflineCard } from "@/lib/offlineCard";

afterEach(() => localStorage.clear());

describe("offline card", () => {
  it("keeps the member number and QR for the offline page", () => {
    saveOfflineCard({ code: "ZP7YA9CR", qrSvg: "<svg/>" });
    expect(JSON.parse(localStorage.getItem(OFFLINE_CARD_KEY)!)).toEqual({ code: "ZP7YA9CR", qrSvg: "<svg/>" });
  });
  it("is removed on sign-out, so the next person on a shared phone never sees it", () => {
    saveOfflineCard({ code: "ZP7YA9CR" });
    clearOfflineCard();
    expect(localStorage.getItem(OFFLINE_CARD_KEY)).toBeNull();
  });
  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveOfflineCard({ code: "ZP7YA9CR" })).not.toThrow();
  });
});
