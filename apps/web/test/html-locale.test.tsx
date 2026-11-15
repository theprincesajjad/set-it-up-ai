import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HtmlLocale } from "../src/lib/i18n/HtmlLocale";

const html = () => ({ lang: document.documentElement.lang, dir: document.documentElement.dir });

describe("HtmlLocale", () => {
  it("puts back the page's language when sibling scopes unmount in any order", () => {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    const a = render(<HtmlLocale lang="ur" dir="rtl" />);
    const b = render(<HtmlLocale lang="ur" dir="rtl" />);
    a.unmount();
    expect(html()).toEqual({ lang: "ur", dir: "rtl" });
    b.unmount();
    expect(html()).toEqual({ lang: "en", dir: "ltr" });
  });

  it("shows the newest scope still mounted", () => {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    const outer = render(<HtmlLocale lang="hi" dir="ltr" />);
    const inner = render(<HtmlLocale lang="ur" dir="rtl" />);
    expect(html()).toEqual({ lang: "ur", dir: "rtl" });
    inner.unmount();
    expect(html()).toEqual({ lang: "hi", dir: "ltr" });
    outer.unmount();
    expect(html()).toEqual({ lang: "en", dir: "ltr" });
  });
});
