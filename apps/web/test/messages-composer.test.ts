import { describe, expect, it } from "vitest";
import { messagingApi } from "@ll/shared";
import { audienceFromParam, chipLabel, defaultBody, defaultSendTime, inQuiet, renderPreview, sendLabel, smsCountLine, smsLength, toApiBody } from "@/lib/dashboard/messages";

describe("messages composer logic", () => {
  it("picks the audience from ?segment= and defaults to slipping away", () => {
    expect(audienceFromParam("regulars")).toBe("regulars");
    expect(audienceFromParam("slipping")).toBe("slipping");
    expect(audienceFromParam("nonsense")).toBe("slipping");
    expect(audienceFromParam(null)).toBe("slipping");
  });

  it("labels chips with the count that can be reached on the channel", () => {
    expect(chipLabel({ label: "Slipping away" }, 9, true, "sms")).toBe("Slipping away · 9 can text");
    expect(chipLabel({ label: "Regulars" }, 41, false, "sms")).toBe("Regulars · 41");
    expect(chipLabel({ label: "Regulars" }, 20, true, "email")).toBe("Regulars · 20 can email");
    expect(chipLabel({ label: "Regulars" }, null, false, "sms")).toBe("Regulars");
  });

  it("turns {first_name} into the API's {{first_name}} without touching real braces or unknown names", () => {
    expect(toApiBody("Hi {first_name}, {merchant} misses you")).toBe("Hi {{first_name}}, {{merchant}} misses you");
    expect(toApiBody("Hi {{first_name}}")).toBe("Hi {{first_name}}");
    expect(toApiBody("Use {code} at the till")).toBe("Use {code} at the till");
  });

  it("previews with a real member's first name", () => {
    expect(renderPreview("Hi {first_name}, come in", { firstName: "Yuki" }, "Pinecone")).toBe("Hi Yuki, come in");
    expect(renderPreview("{merchant} has {balance} {terminology}", { firstName: "Yuki", balance: 7, terminology: "stamps" }, "Pinecone")).toBe("Pinecone has 7 stamps");
  });

  it("counts the footer the server adds towards the length", () => {
    const footer = `— ${messagingApi.smsFooterText("Pinecone Coffee Co.", "412 Roncesvalles Ave")}`;
    expect(footer).toBe("— Pinecone Coffee Co., 412 Roncesvalles Ave. Reply STOP to unsubscribe.");
    expect(smsLength("Hi", "Pinecone Coffee Co.", "412 Roncesvalles Ave")).toBe(2 + 1 + footer.length);
    expect(smsCountLine(141)).toBe("141 of 160 characters, one text per person");
    expect(smsCountLine(200)).toBe("200 characters, 2 texts per person");
    expect(smsCountLine(161)).toBe("161 characters, 2 texts per person");
  });

  it("starts from words that fit the audience", () => {
    expect(defaultBody("slipping", "free drink")).toContain("your next free drink is on us");
    expect(defaultBody("reward_ready", "free drink")).toContain("your free drink is ready");
    expect(defaultBody("slipping")).toContain("{first_name}");
  });

  it("defaults the send time to the next half hour inside 8 am to 9 pm, never in quiet hours", () => {
    // 10:04 am Toronto (14:04Z, EDT) -> 10:30 am today.
    expect(defaultSendTime(new Date("2026-10-23T14:04:00Z"))).toMatchObject({ label: "Today 10:30 am" });
    // 9:00 pm exactly is quiet: tomorrow 9:00 am.
    expect(defaultSendTime(new Date("2026-10-24T01:00:00Z")).label).toBe("Tomorrow 9:00 am");
    // 11 pm: tomorrow 9 am.
    expect(defaultSendTime(new Date("2026-10-24T03:00:00Z")).label).toBe("Tomorrow 9:00 am");
    // 6:10 am: 9:00 am today.
    const early = defaultSendTime(new Date("2026-10-23T10:10:00Z"));
    expect(early.label).toBe("Today 9:00 am");
    expect(early.at.toISOString()).toBe("2026-10-23T13:00:00.000Z");
    // Never inside quiet hours.
    for (let h = 0; h < 24; h++) expect(inQuiet(defaultSendTime(new Date(Date.UTC(2026, 9, 23, h, 7))).at)).toBe(false);
  });

  it("names the send button after the channel and count", () => {
    expect(sendLabel("at", 9, "sms")).toBe("Schedule 9 texts");
    expect(sendLabel("now", 1, "sms")).toBe("Send 1 text");
    expect(sendLabel("at", 20, "email")).toBe("Schedule 20 emails");
  });
});
