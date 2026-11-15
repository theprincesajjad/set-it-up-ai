"use client";
import { useLayoutEffect } from "react";

/**
 * Mirrors a LocaleScope's `lang` and `dir` onto <html>. The root layout is static (it cannot see ?lang=), and a portal (dialog, menu,
 * toast, sheet) renders under <body>, outside the scope's div: without this it would be left to right in English type on an Urdu page.
 *
 * Scopes can sit side by side or nest, and they unmount in any order, so each mounted scope is kept on a stack: <html> always shows the
 * most recently mounted scope still on the page, and the values from before the first scope come back when the last one unmounts.
 */
type Entry = { lang: string; dir: "ltr" | "rtl" };
const stack: Entry[] = [];
let base: { lang: string; dir: string } | null = null;

function apply() {
  const el = document.documentElement;
  const top = stack[stack.length - 1];
  const next = top ?? base;
  if (next) {
    el.lang = next.lang;
    el.dir = next.dir;
  }
  if (!top) base = null;
}

export function HtmlLocale({ lang, dir }: { lang: string; dir: "ltr" | "rtl" }) {
  useLayoutEffect(() => {
    if (stack.length === 0) base = { lang: document.documentElement.lang, dir: document.documentElement.dir };
    const entry: Entry = { lang, dir };
    stack.push(entry);
    apply();
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      apply();
    };
  }, [lang, dir]);
  return null;
}
