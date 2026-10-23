"use client";
import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, LOCALES, negotiateLocale, normalizeLocale, t, type Locale } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";

/** An error boundary can't read the server's locale, so it repeats the same order in the browser: ?lang → ll_lang cookie → browser language → en. */
function detectLocale(): Locale {
  try {
    const q = normalizeLocale(new URLSearchParams(window.location.search).get("lang"));
    if (q) return q;
    const cookie = /(?:^|;\s*)ll_lang=([^;]+)/.exec(document.cookie)?.[1];
    return normalizeLocale(cookie) ?? negotiateLocale(navigator.languages?.join(",") ?? navigator.language, DEFAULT_LOCALE);
  } catch {
    return DEFAULT_LOCALE;
  }
}

const subscribeNever = () => () => undefined;

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // English while hydrating, then the visitor's language (no effect needed for a value that never changes).
  const locale = useSyncExternalStore(subscribeNever, detectLocale, () => DEFAULT_LOCALE);
  const info = LOCALES[locale];
  return (
    <main id="main" lang={info.bcp47} dir={info.dir} className="mx-auto max-w-[480px] px-4 py-16">
      <ErrorState title={t(locale, "auth.error.title")} description={t(locale, "auth.error.body")} action={<Button variant="secondary" onClick={reset}>{t(locale, "auth.error.retry")}</Button>} />
    </main>
  );
}
