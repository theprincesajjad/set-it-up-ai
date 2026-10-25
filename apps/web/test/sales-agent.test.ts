import { describe, expect, it } from "vitest";
import { AGENT_TEXTS, WIDGET_TEXTS } from "@ll/shared";
import { afterReply, chatLang, lastRemoteAt, loadChat, mergeLines, saveChat, shouldPoll, type Line } from "@/lib/marketing/salesChat";
import { signupPrefill } from "@/lib/marketing/signupPrefill";
import { guardLabel, languageName, queueCount, toolLabel, waiting } from "@/lib/sales-agent/console";

const line = (id: string, role: Line["role"], at = "2026-11-03T15:00:00.000Z", text = id): Line => ({ id, role, at, text });

describe("chat widget helpers", () => {
  it("picks the widget language from the page, then the browser, else English", () => {
    expect(chatLang("ur", "en-CA")).toBe("ur");
    expect(chatLang("", "pa-IN")).toBe("pa");
    expect(chatLang(undefined, "fr-CA")).toBe("en");
    expect(chatLang("hi-IN")).toBe("hi");
  });

  it("merges by id in arrival order, never twice", () => {
    const a = [line("1", "assistant"), line("2", "user")];
    expect(mergeLines(a, [line("2", "user"), line("3", "human")]).map((l) => l.id)).toEqual(["1", "2", "3"]);
    expect(mergeLines(a, [line("1", "assistant")])).toBe(a);
  });

  it("puts the disclosure before the visitor's first message and the reply after it", () => {
    const mine = line("local-1", "user");
    const out = afterReply([mine], mine, [line("d", "assistant"), line("r", "assistant")]);
    expect(out.map((l) => l.id)).toEqual(["d", "local-1", "r"]);
    const later = afterReply([...out, line("local-2", "user")], line("local-2", "user"), [line("r2", "assistant")]);
    expect(later.map((l) => l.id)).toEqual(["d", "local-1", "r", "local-2", "r2"]);
  });

  it("polls only while a person is involved, from the newest line the team side sent", () => {
    expect(shouldPoll("open")).toBe(false);
    expect(shouldPoll("handoff")).toBe(true);
    expect(shouldPoll("human")).toBe(true);
    expect(lastRemoteAt([line("1", "assistant", "2026-11-03T15:00:00.000Z"), line("2", "user", "2026-11-03T15:01:00.000Z")])).toBe("2026-11-03T15:00:00.000Z");
    expect(lastRemoteAt([line("2", "user")])).toBeUndefined();
  });

  it("saves and loads the chat, and survives blocked or corrupt storage", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    saveChat(store, { token: "wc_abcdefghijklmnopqrstuv", lines: [line("1", "assistant")], status: "handoff" });
    expect(loadChat(store)).toMatchObject({ token: "wc_abcdefghijklmnopqrstuv", status: "handoff" });
    expect(loadChat({ getItem: () => "{not json" })).toBeNull();
    expect(loadChat({ getItem: () => JSON.stringify({ token: 5 }) })).toBeNull();
    expect(loadChat(null)).toBeNull();
    expect(() => saveChat({ setItem: () => { throw new Error("blocked"); } }, { token: "t", lines: [], status: "open" })).not.toThrow();
  });

  it("has the widget's strings and the disclosure in all four languages, saying it is an AI and how to reach a person", () => {
    for (const lang of ["en", "hi", "ur", "pa"] as const) {
      const w = WIDGET_TEXTS[lang];
      for (const v of [w.launcher, w.title, w.subtitle, w.placeholder, w.send, w.close, w.whatsapp, w.retention, w.privacy, w.error, ...w.chips]) expect(v.length, `${lang}`).toBeGreaterThan(1);
      const d = AGENT_TEXTS[lang].disclosure({ whatsapp: false });
      expect(d).toContain("AI");
      expect(d).toContain("HUMAN");
      expect(AGENT_TEXTS[lang].disclosure({ whatsapp: true })).toContain("STOP");
      expect(AGENT_TEXTS[lang].stopped).toContain("START");
    }
    expect(WIDGET_TEXTS.en.retention).toContain("90");
  });
});

describe("sign-up prefill from the assistant's link", () => {
  it("takes a shop name, a known vertical and a phone, and nothing else", () => {
    expect(signupPrefill({ shop: "Nawab Biryani", vertical: "restaurant", phone: "+1 (647) 555-0199", ref: "assistant" })).toEqual({ shop: "Nawab Biryani", vertical: "restaurant", phone: "6475550199" });
  });
  it("drops markup, unknown verticals and short numbers", () => {
    expect(signupPrefill({ shop: "<img src=x onerror=alert(1)>Evil", vertical: "weapons", phone: "12" })).toEqual({ shop: "img src=x onerror=alert(1)Evil" });
    expect(signupPrefill({ shop: ["A", "B"], vertical: undefined })).toEqual({ shop: "A" });
    expect(signupPrefill({ shop: "x".repeat(500) }).shop).toHaveLength(120);
  });
});

describe("console helpers", () => {
  it("says how long a hand-off has waited", () => {
    const now = new Date("2026-11-03T15:00:00Z").getTime();
    expect(waiting(null, now)).toBeNull();
    expect(waiting("2026-11-03T14:59:30Z", now)).toBe("just now");
    expect(waiting("2026-11-03T14:48:00Z", now)).toBe("12 min");
    expect(waiting("2026-11-03T12:00:00Z", now)).toBe("3 h");
    expect(waiting("2026-10-30T15:00:00Z", now)).toBe("4 d");
  });
  it("labels tools, guardrails and languages in plain words", () => {
    expect(toolLabel("get_pricing")).toBe("Looked up pricing");
    expect(toolLabel("something_new")).toBe("something_new");
    expect(guardLabel("price_mismatch")).toContain("plans.ts");
    expect(languageName("ur")).toBe("Urdu");
    expect(queueCount([{ status: "handoff" }, { status: "open" }, { status: "handoff" }])).toBe(2);
  });
});
