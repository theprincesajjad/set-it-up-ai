"use client";
import { useLayoutEffect } from "react";

/**
 * Mirrors a LocaleScope's `lang` and `dir` onto <html>. The root layout is static (it cannot see ?lang=), and a portal (dialog, menu,
 * toast, sheet) renders under <body>, outside the scope's div: without this it would be left to right in English type on an Urdu page.
 * The previous values come back when the scope unmounts.
 */
export function HtmlLocale({ lang, dir }: { lang: string; dir: "ltr" | "rtl" }) {
  useLayoutEffect(() => {
    const el = document.documentElement;
    const before = { lang: el.lang, dir: el.dir };
    el.lang = lang;
    el.dir = dir;
    return () => {
      el.lang = before.lang;
      el.dir = before.dir;
    };
  }, [lang, dir]);
  return null;
}
