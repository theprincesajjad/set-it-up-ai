"use client";
import { CircleAlert, CloudOff, Lock, SearchX, WifiOff, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { BRAND, type MessageKey, type Vars } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { errorKind, isApiError, kindFromEnglishLine, type ErrorKind } from "@/lib/api/errors";
import { BODY_KEY, TITLE_KEY, userMessage, waitText } from "@/lib/api/userError";
import { cn } from "@/lib/utils";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { audienceFromPath, isShopSide, reassuresShop, type Audience } from "./audience";
import { FailScreen } from "./FailScreen";
import { GoBackButton, RetryButton, SignInAgainLink, SwitchAccountButton } from "./actions";

/**
 * A failed request, shown properly. One component picks the words and the action from the KIND of failure:
 *
 *   offline / network  "You're offline" / "We couldn't reach Local Loyalty"  -> Try again
 *   session (401)      "Your session ended"                                   -> Sign in again (to /login?next=<this page>)
 *   forbidden (403)    "You don't have access to this"                        -> Sign in with a different account
 *   notFound (404)     "We couldn't find that" (or the caller's own words)    -> the way back the caller names
 *   conflict (409)     "That changed while you were working"                  -> Reload
 *   rateLimited (429)  "You're going a little fast", with Retry-After         -> Try again
 *   server (5xx)       "Something went wrong on our side"                     -> Try again
 *   validation (400)   "Check what you entered" (fields show the detail)      -> none
 *
 *   <ErrorPanel error={state.cause} what="your customers" onRetry={state.reload} />       compact card inside a page or a list
 *   <ErrorScreen error={e} onRetry={reload} back={{ href: base, label: "Back to Today" }} />   the whole page
 */
export interface ErrorViewProps {
  /** The thrown value (an ApiError from the client, or anything). A plain string is shown as the description with the generic title. */
  error: unknown;
  /** What was being loaded, as a noun phrase in the page's language ("your customers"). Titles become "Couldn’t load your customers". */
  what?: string;
  /** The whole title for a "could not load" failure, when `what` cannot say it ("Couldn’t load your customers."). Ignored for session, access and not-found failures, which have their own titles. */
  heading?: string;
  /** Retry the request. Without it a retryable failure shows no button. */
  onRetry?: () => void;
  /** The way out for a 404 (and a second action elsewhere): where to go and what to call it. */
  back?: { href: string; label: string };
  /** 404 in the caller's own words ("That customer isn’t here"). */
  notFound?: { title: string; description?: string };
  /** 403 in the caller's own words (a rep opening a shop that is not on their list). */
  forbidden?: { title: string; description?: string };
  /** The id in the link is malformed, so a 400 is a missing record, not a form problem: show the not-found copy. */
  invalidIsNotFound?: boolean;
  /** Override the audience (default: from the URL). */
  audience?: Audience;
  className?: string;
}

const LINE_FOR = { offline: "err.offline.line", network: "err.network.line", server: "err.server.line", generic: "err.generic.line", conflict: "err.conflict.line", rateLimited: "err.rate.lineNoWait" } as const;

const ICON: Record<ErrorKind, LucideIcon> = { offline: WifiOff, network: CloudOff, session: Lock, forbidden: Lock, notFound: SearchX, conflict: CircleAlert, rateLimited: CircleAlert, validation: CircleAlert, server: CloudOff, generic: CircleAlert };

/** Words and actions for one failure. Shared by the panel and the full screen. */
export function useErrorCopy({ error, what, heading, onRetry, back, notFound, forbidden, invalidIsNotFound, audience }: ErrorViewProps) {
  const { t, locale } = useLocaleOrEnglish();
  const pathname = usePathname();
  const aud = audience ?? audienceFromPath(pathname);
  return useMemo(() => {
    // A string is the message `errorMessage()` made (what `useApi().error` holds): recognise the kind it came from, so callers that kept only the string get the right action.
    const fromLine = typeof error === "string" ? kindFromEnglishLine(error) : null;
    const text = typeof error === "string" && !fromLine;
    let kind: ErrorKind = typeof error === "string" ? (fromLine ?? "generic") : errorKind(error);
    if (invalidIsNotFound && kind === "validation") kind = "notFound";
    const retryAfter = isApiError(error) ? error.retryAfter : undefined;
    let title: string = t(TITLE_KEY[kind]);
    let body: string;
    if (text) body = error as string;
    else if (fromLine === "rateLimited" && typeof error === "string") body = error;
    else if (kind === "rateLimited") body = retryAfter && retryAfter > 0 ? t("err.rate.body", { wait: waitText(retryAfter, t) }) : t("err.rate.bodyNoWait");
    else if (kind === "forbidden") body = t(isShopSide(aud) ? "err.forbidden.body.owner" : "err.forbidden.body.customer");
    else body = t(BODY_KEY[kind]);
    if (kind === "notFound" && notFound) {
      title = notFound.title;
      body = notFound.description ?? "";
    }
    if (kind === "forbidden" && forbidden) {
      title = forbidden.title;
      body = forbidden.description ?? "";
    }
    // A list that could not load says which list; the body is then the one-line cause with its next step.
    const loadKind = kind === "offline" || kind === "network" || kind === "server" || kind === "generic" || kind === "rateLimited" || kind === "conflict";
    // Callers' own titles ("Couldn't load your customers.") get the house apostrophe.
    if (heading && loadKind) title = heading.replace(/(?<=[A-Za-z])'(?=[a-z])/g, "\u2019");
    if ((what || heading) && loadKind && !text) {
      if (what) title = t("err.listFailed", { what });
      body = typeof error === "string" ? (kind === "rateLimited" ? error : t(LINE_FOR[kind as keyof typeof LINE_FOR])) : userMessage(error, t, locale);
      if ((kind === "offline" || kind === "network" || kind === "server") && (aud === "customer" || reassuresShop(aud))) body = `${body} ${t(aud === "customer" ? "err.safe.customer" : "err.safe.owner")}`;
    }
    const help = kind === "server" || kind === "network" || kind === "generic" ? helpLine(aud, t) : null;
    return { kind, title, body, help, aud, locale, t, retry: kind === "session" || kind === "forbidden" || kind === "notFound" || kind === "validation" ? null : onRetry ?? null, back };
  }, [error, what, heading, onRetry, back, notFound, forbidden, invalidIsNotFound, aud, t, locale]);
}

type Tfn = (key: MessageKey, vars?: Vars) => string;

/** Who to contact. Shops: our support address. Customers: the shop. */
export function helpLine(aud: Audience, t: Tfn): ReactNode {
  if (aud === "customer") return t("err.help.customer");
  const text = t("err.help.email", { address: BRAND.supportEmail });
  const i = text.indexOf(BRAND.supportEmail);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <a href={`mailto:${BRAND.supportEmail}`} dir="ltr" className="underline underline-offset-2">
        {BRAND.supportEmail}
      </a>
      {text.slice(i + BRAND.supportEmail.length)}
    </>
  );
}

/** The actions for a failure: the primary one first. */
function Actions({ c, size }: { c: ReturnType<typeof useErrorCopy>; size: "sm" | "md" }) {
  const { kind, t, retry, back } = c;
  return (
    <>
      {kind === "session" ? <SignInAgainLink label={t("err.session.action")} size={size} /> : null}
      {kind === "forbidden" && back ? (
        <Button href={back.href} size={size}>
          {back.label}
        </Button>
      ) : null}
      {kind === "forbidden" ? <SwitchAccountButton label={t("err.forbidden.action")} size={size} variant={back ? "ghost" : "primary"} /> : null}
      {kind === "conflict" ? (
        <Button size={size} onClick={() => window.location.reload()}>
          {t("err.action.reload")}
        </Button>
      ) : null}
      {retry && kind !== "conflict" ? (
        <Button size={size} variant={size === "sm" ? "secondary" : "primary"} onClick={retry}>
          {t("err.action.retry")}
        </Button>
      ) : null}
      {back && kind !== "forbidden" ? (
        <Button href={back.href} size={size} variant={kind === "notFound" ? "primary" : "ghost"}>
          {back.label}
        </Button>
      ) : kind === "notFound" ? (
        <GoBackButton label={t("err.action.back")} size={size} variant="secondary" />
      ) : null}
    </>
  );
}

/** Compact failure card for inside a page or list. `role="alert"` so it is announced; keeps the surrounding page and navigation. */
export function ErrorPanel(props: ErrorViewProps) {
  const c = useErrorCopy(props);
  const Icon = ICON[c.kind];
  return (
    <div role="alert" data-state="error" data-error-kind={c.kind} className={cn("rounded-card border border-line bg-card p-5", props.className)}>
      <div className="flex items-start gap-3">
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-negative" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-body-strong text-fg">{c.title}</p>
          {c.body ? <p className="mt-1 text-meta text-fg-muted">{c.body}</p> : null}
          {c.help ? <p className="mt-1 text-caption text-fg-muted">{c.help}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Actions c={c} size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The whole page failed to load: an h1, the cause, the primary action and a way out. Render it INSTEAD of the content, never beside fake data. */
export function ErrorScreen(props: ErrorViewProps & { level?: 1 | 2 }) {
  const c = useErrorCopy(props);
  return (
    <FailScreen
      title={c.title}
      description={c.body || undefined}
      help={c.help}
      icon={ICON[c.kind]}
      level={props.level ?? 1}
      primary={<Actions c={{ ...c, back: undefined }} size="md" />}
      secondary={c.back ? <Button href={c.back.href} variant={c.kind === "notFound" ? "primary" : "ghost"}>{c.back.label}</Button> : undefined}
      className={props.className}
    />
  );
}

export { RetryButton };
