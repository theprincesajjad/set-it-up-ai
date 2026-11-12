"use client";
import { useCallback } from "react";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { fieldErrors, userMessage, type ErrorContext } from "./userError";

/**
 * Bind `userMessage` to the page's language. Use in every customer, counter and translated component instead of `errorMessage(e)`:
 *
 *   const text = useErrorText();
 *   try { ... } catch (e) { setError(text(e, { conflict: t("book.slotTaken") })); }
 */
export function useErrorText(): (e: unknown, ctx?: ErrorContext) => string {
  const { t, locale } = useLocaleOrEnglish();
  return useCallback((e, ctx) => userMessage(e, t, locale, ctx), [t, locale]);
}

/** `fieldErrors` bound to the page's language: `const fe = useFieldErrors(); setErrors(fe(e))`. */
export function useFieldErrors(): (e: unknown) => Record<string, string> {
  const { t, locale } = useLocaleOrEnglish();
  return useCallback((e) => fieldErrors(e, t, locale), [t, locale]);
}

/**
 * After a failed submit has put `error` on its fields (`aria-invalid="true"`), move focus to the first bad one so a keyboard or
 * screen-reader user lands on it. Call after setting state: it waits one frame for React to paint the invalid state.
 */
export function focusFirstInvalid(root: ParentNode | null | undefined = typeof document === "undefined" ? null : document): void {
  if (!root || typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const el = root.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
}
