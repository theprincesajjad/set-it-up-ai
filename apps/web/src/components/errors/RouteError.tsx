"use client";
import { CloudOff, WifiOff } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALES, negotiateLocale, normalizeLocale, type Locale } from "@ll/shared";
import { Button, buttonClasses } from "@/components/ui/Button";
import { isOffline } from "@/lib/api/errors";
import { translateWith, useCatalog } from "@/lib/i18n/catalog";
import { audienceFromPath, merchantBase, reassuresShop, type Audience } from "./audience";
import { FailScreen } from "./FailScreen";
import { RetryButton } from "./actions";
import { helpLine } from "./ErrorView";

/** An error boundary cannot read the server's locale, so it repeats the same order in the browser: ?lang → ll_lang cookie → browser language → en. */
export function detectLocale(): Locale {
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
const subscribeOnline = (fn: () => void) => {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
};

export interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Who is looking. Default: from the URL. */
  audience?: Audience;
  /** Wrap in a <main> (the root boundary has no layout around it; a group boundary inside a layout that already has <main> must not). */
  landmark?: boolean;
  /** Override the way out (default by audience). */
  exit?: { href: string; label: string };
}

/**
 * The body of every `error.tsx`: ONE component for the app, so every area fails the same way and says the right thing to its audience.
 * Title: what happened. Line: why, plus reassurance. Primary: Try again (re-renders the segment). A way out by audience: shoppers go to
 * their card, owners to Today, staff to the counter, visitors Home. A reference code for support. Translated.
 *
 *   // app/(dashboard)/m/[merchantId]/error.tsx
 *   "use client";
 *   export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) { return <RouteError {...props} />; }
 */
export function RouteError({ error, reset, audience, landmark = false, exit }: RouteErrorProps) {
  const locale = useSyncExternalStore(subscribeNever, detectLocale, () => DEFAULT_LOCALE);
  const info = LOCALES[locale];
  useEffect(() => {
    // The server has already logged it; this puts it in the browser console for support calls.
    console.error(error);
  }, [error]);
  const body = (
    <Suspense fallback={null}>
      <Body error={error} reset={reset} audience={audience} locale={locale} exit={exit} />
    </Suspense>
  );
  return landmark ? (
    <main id="main" lang={info.bcp47} dir={info.dir} className="mx-auto max-w-120 px-4 py-16">
      {body}
    </main>
  ) : (
    <div lang={info.bcp47} dir={info.dir}>
      {body}
    </div>
  );
}

function Body({ error, reset, audience, locale, exit }: { error: Error & { digest?: string }; reset: () => void; audience?: Audience; locale: Locale; exit?: { href: string; label: string } }) {
  const m = useCatalog(locale);
  const t = (k: Parameters<typeof translateWith>[2], v?: Parameters<typeof translateWith>[3]) => translateWith(m, locale, k, v);
  const pathname = usePathname();
  const aud = audience ?? audienceFromPath(pathname);
  const offline = useSyncExternalStore(subscribeOnline, isOffline, () => false);
  const base = merchantBase(pathname);

  let title = t("err.server.title");
  let description = `${t("err.server.body")} ${reassuresShop(aud) ? t("err.safe.owner") : aud === "customer" ? t("err.safe.customer") : ""}`.trim();
  if (aud === "visitor") {
    title = t("err.page.title");
    description = t("err.page.body");
  }
  if (offline) {
    title = t("err.offline.title");
    description = t("err.offline.body");
  }

  // A way out by audience (a hard <a>, so it works even when the client router is what broke).
  let way: { href: string; label: string } = { href: "/", label: t("err.action.home") };
  if (aud === "customer") way = { href: "/me", label: t("err.action.myCard") };
  else if (aud === "owner" || aud === "staff") way = base ? { href: base, label: t("err.action.today") } : pathname?.startsWith("/rep") ? { href: "/rep", label: t("err.action.home") } : pathname?.startsWith("/bia") ? { href: "/bia", label: t("err.action.home") } : { href: "/m", label: t("err.action.dashboard") };
  else if (aud === "admin") way = { href: "/admin", label: t("err.action.home") };
  if (exit) way = exit;
  // The counter works without the rest of the dashboard: offer it where a shop is known.
  const counter: ReactNode = base && (aud === "owner" || aud === "staff") ? <Button href={`${base}/counter`} variant="secondary">{t("err.action.counter")}</Button> : null;

  return (
    <FailScreen
      title={title}
      description={description}
      help={helpLine(aud, t)}
      icon={offline ? WifiOff : CloudOff}
      reference={error.digest ? t("err.ref", { code: error.digest.slice(0, 8) }) : undefined}
      primary={<RetryButton label={t("err.action.retry")} onRetry={reset} />}
      secondary={
        <>
          <a href={way.href} className={buttonClasses({ variant: "secondary" })}>
            {way.label}
          </a>
          {counter}
        </>
      }
    />
  );
}
