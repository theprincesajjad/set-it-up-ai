import { describe, expect, it } from "vitest";
import { isCustomSiteHost } from "@/lib/siteHost";

const env = { siteUrl: "https://localloyalty.ca", appHosts: "app.localloyalty.ca, staging.example.com" };

describe("custom site hosts", () => {
  it("our own hosts, localhost, IPs and previews are not shop domains", () => {
    for (const h of ["localloyalty.ca", "www.localloyalty.ca", "app.localloyalty.ca", "staging.example.com", "localhost:3100", "127.0.0.1:3000", "x.vercel.app", null]) expect(isCustomSiteHost(h, env)).toBeNull();
  });
  it("a shop's domain is, without www", () => {
    expect(isCustomSiteHost("www.PriyaNails.ca", env)).toBe("priyanails.ca");
    expect(isCustomSiteHost("priyanails.ca:443", env)).toBe("priyanails.ca");
  });
  it("SITE_CUSTOM_HOSTS=0 turns routing off", () => {
    expect(isCustomSiteHost("priyanails.ca", { ...env, enabled: "0" })).toBeNull();
  });
});
