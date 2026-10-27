import { describe, expect, it } from "vitest";
import { SERVICE_STARTERS, serviceBaseName, serviceFitsSize, serviceSize } from "../src/service-starters.js";

describe("service starters", () => {
  it("a groomer's list is priced by dog size and has no bridal line", () => {
    const pet = SERVICE_STARTERS.pet!;
    expect(pet.some((s) => /bridal/i.test(s.name))).toBe(false);
    const full = pet.filter((s) => s.name.startsWith("Full groom"));
    expect(full.map((s) => serviceSize(s.name))).toEqual(["small", "medium", "large", "giant"]);
    expect(full[0]!.priceCents).toBeLessThan(full[3]!.priceCents);
    expect(full[0]!.durationMin).toBeLessThan(full[3]!.durationMin);
  });
  it("shows a dog only the prices for its size, and every size when no dog is picked", () => {
    expect(serviceFitsSize("Full groom (large dog)", "large")).toBe(true);
    expect(serviceFitsSize("Full groom (large dog)", "small")).toBe(false);
    expect(serviceFitsSize("Nail trim", "small")).toBe(true);
    expect(serviceFitsSize("Full groom (large dog)", null)).toBe(true);
    expect(serviceBaseName("Full groom (large dog)")).toBe("Full groom");
  });
  it("salons and barbers get their own starters", () => {
    expect(SERVICE_STARTERS.salon!.map((s) => s.name)).toContain("Haircut");
    expect(SERVICE_STARTERS.barber!.map((s) => s.name)).toContain("Beard trim");
  });
});
