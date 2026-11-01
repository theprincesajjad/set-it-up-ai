import { describe, expect, it } from "vitest";
import { homeAidCookie } from "@/lib/marketing/landing-assign";

/** Wave N (admin funnel): "/" gets the landing id on a first, signed-out, counted visit only. */
describe("homeAidCookie", () => {
  const input = (o: { path?: string; cookies?: Record<string, string>; gpc?: boolean } = {}) => ({
    pathname: o.path ?? "/",
    cookie: (n: string) => o.cookies?.[n],
    header: (n: string) => (n === "sec-gpc" && o.gpc ? "1" : null),
    newAid: () => "NewAidNewAidNewAidNew0",
  });
  it("writes a 30-day id on a first visit to /", () => {
    expect(homeAidCookie(input())).toEqual({ name: "ll_aid", value: "NewAidNewAidNewAidNew0", maxAge: 30 * 86_400 });
  });
  it("writes nothing elsewhere, with GPC, when counting is off, when an id exists, or for a signed-in visitor", () => {
    expect(homeAidCookie(input({ path: "/pricing" }))).toBeNull();
    expect(homeAidCookie(input({ gpc: true }))).toBeNull();
    expect(homeAidCookie(input({ cookies: { ll_aid: "off" } }))).toBeNull();
    expect(homeAidCookie(input({ cookies: { ll_aid: "HadOneHadOneHadOneHad0" } }))).toBeNull();
    expect(homeAidCookie(input({ cookies: { ll_rt: "x" } }))).toBeNull();
    expect(homeAidCookie(input({ cookies: { ll_at: "x" } }))).toBeNull();
  });
});
