import { describe, expect, it } from "vitest";
import { centsToField, fieldToCents, parsePeople, smsHref } from "@/lib/dashboard/onboarding";
import { signupPrefill } from "@/lib/marketing/signupPrefill";
import { afterSignupPath } from "@/lib/signupRoute";

describe("solo signup routing and prefill", () => {
  it("sends solo pros to their booking link and keeps every older path", () => {
    expect(afterSignupPath("/m/a", "nails")).toBe("/m/a/setup?step=your_link");
    expect(afterSignupPath("/m/a", "barber", null, "home")).toBe("/m/a/setup?step=your_link");
    expect(afterSignupPath("/m/a", "salon", null, "shop")).toBe("/m/a/setup?step=your_link");
    expect(afterSignupPath("/m/a", "salon")).toBe("/m/a/setup?step=trade_setup");
    expect(afterSignupPath("/m/a", "cafe", null, "shop")).toBe("/m/a/setup?step=first_stamp");
    expect(afterSignupPath("/m/a", "nails", "plus")).toBe("/m/a/billing?subscribe=plus");
  });
  it("reads ?vertical=nails&src=ig and drops junk", () => {
    expect(signupPrefill({ vertical: "nails", src: "ig" })).toEqual({ vertical: "nails", src: "ig" });
    expect(signupPrefill({ vertical: "nails", src: "<script>" })).toEqual({ vertical: "nails" });
  });
});

describe("setup card helpers", () => {
  it("money fields, pasted numbers and the sms link", () => {
    expect(centsToField(5500)).toBe("55");
    expect(centsToField(5550)).toBe("55.50");
    expect(fieldToCents("$55.5")).toBe(5550);
    expect(fieldToCents("")).toBeNull();
    expect(parsePeople("Ava 416 555 0199\n4165550123, Sam\nnot a number\n+1 (647) 555-0100")).toEqual([
      { name: "Ava", phone: "4165550199" },
      { name: "Sam", phone: "4165550123" },
      { name: null, phone: "6475550100" },
    ]);
    expect(smsHref("Hi & bye")).toBe("sms:?&body=Hi%20%26%20bye");
  });
});
