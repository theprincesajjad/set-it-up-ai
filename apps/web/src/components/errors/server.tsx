import { Link2Off, WifiOff, ShieldAlert } from "lucide-react";
import { BRAND } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Layout";
import { roleHome } from "@/lib/auth/home";
import { getT } from "@/lib/i18n/server";
import { FailScreen } from "./FailScreen";
import { RetryButton, SwitchAccountButton } from "./actions";
import type { Audience } from "./audience";

/**
 * Server-rendered failure screens for layouts and pages (translated with the request's language). They render IN PLACE of the content,
 * with no redirect, so a person whose session is fine is never told they were signed out.
 */

/**
 * The API could not be reached while a layout was loading. "We couldn't reach Local Loyalty", Try again (re-renders the segment), and
 * for shops the counter (it keeps working offline). NEVER redirect to /login for this: the person is still signed in.
 */
export async function ServiceUnreachable({ audience = "owner", counterHref, homeHref }: { audience?: Audience; counterHref?: string; homeHref?: string }) {
  const t = await getT();
  const shop = audience !== "customer" && audience !== "visitor";
  return (
    <main id="main">
      <Container size="public" className="py-16">
      <FailScreen
        title={t("err.network.title")}
        description={`${t("err.network.body")} ${audience === "owner" ? t("err.safe.owner") : audience === "customer" ? t("err.safe.customer") : ""}`.trim()}
        help={shop ? t("err.help.email", { address: BRAND.supportEmail }) : t("err.help.customer")}
        icon={WifiOff}
        primary={<RetryButton label={t("err.action.retry")} />}
        secondary={
          <>
            {counterHref ? (
              <Button href={counterHref} variant="secondary">
                {t("err.action.counter")}
              </Button>
            ) : null}
            {homeHref ? (
              <Button href={homeHref} variant="ghost">
                {t("err.action.home")}
              </Button>
            ) : null}
          </>
        }
      />
      </Container>
    </main>
  );
}

/**
 * Signed in, but not allowed here (a different shop, a role too low, the wrong area). Says who you are signed in as, offers the place
 * you CAN go, and "Sign in with a different account" (signs out, then /login?next=). Server-safe.
 */
export async function AccessDenied({ title, description, goHref, goLabel, next }: { title: string; description: string; goHref?: string; goLabel?: string; next?: string }) {
  const t = await getT();
  return (
    <main id="main">
      <Container size="public" className="py-16">
      <FailScreen
        title={title}
        description={description}
        icon={ShieldAlert}
        primary={goHref ? <Button href={goHref}>{goLabel ?? t("err.action.dashboard")}</Button> : undefined}
        secondary={<SwitchAccountButton label={t("err.forbidden.action")} next={next} variant="secondary" />}
      />
      </Container>
    </main>
  );
}

type TFn = Awaited<ReturnType<typeof getT>>;

/** The place a signed-in person CAN go, by role (lib/auth/home.ts): their shop's Today, the admin or rep console, the BIA console, or their card (customers). */
export function homeFor(me: { merchants: { merchantId: string }[]; platformRole: string; biaManager?: boolean }, t: TFn): { href: string; label: string } {
  const href = roleHome(me);
  return href ? { href, label: t("err.action.dashboard") } : { href: "/me", label: t("err.action.myCard") };
}

/** How to name the signed-in account on a denied screen: email, else phone, else name. */
export function accountLabel(user: { email: string | null; phone: string | null; name: string | null }): string {
  return user.email ?? user.phone ?? user.name ?? "";
}

/** What a public link page learned from the API: it never existed (404/400/402), it lapsed (410), the network is rate limited (429), or we could not load it. */
export type LinkKind = "gone" | "expired" | "rate" | "error";

/** Classify a failed link fetch (a thrown ApiError or anything else). */
export function linkKind(e: unknown): LinkKind {
  const status = typeof e === "object" && e !== null && "status" in e ? Number((e as { status: unknown }).status) : 0;
  if (status === 404 || status === 400 || status === 402) return "gone";
  if (status === 410) return "expired";
  if (status === 429) return "rate";
  return "error";
}

/**
 * A public link page (text-message link to a quote, invoice, repair, review, spot, split bill) that has nothing to show, in the right words:
 *   gone     "We can't find this link"       (never existed, or copied wrong)   -> Find shops
 *   expired  "This link has expired"         (lapsed or used)                   -> Call {shop} when the API named it, else Find shops
 *   rate     "You're going a little fast"    (this network asked too often)     -> Try again later
 *   error    "Something went wrong on our side"                                -> Try again
 * Always an h1. `goneTitle`/`goneBody` keep a page's own words for the "gone" state (already translated).
 */
export async function LinkProblem({ kind, retryHref, goneTitle, goneBody, shop }: { kind: LinkKind; retryHref: string; goneTitle?: string; goneBody?: string; shop?: { name: string | null; phone: string | null } | null }) {
  const t = await getT();
  const name = shop?.name ?? null;
  const call = shop?.phone ? (
    <Button href={`tel:${shop.phone}`}>{name ? t("err.action.callShop", { shop: name }) : shop.phone}</Button>
  ) : (
    <Button href="/map">{t("err.action.findShops")}</Button>
  );
  const home = (
    <Button href="/" variant="ghost">
      {t("err.action.home")}
    </Button>
  );
  if (kind === "gone")
    return <FailScreen icon={Link2Off} title={goneTitle ?? t("err.nf.link.title")} description={goneBody ?? t("err.nf.link.body")} primary={call} secondary={home} />;
  if (kind === "expired")
    return <FailScreen icon={Link2Off} title={t("err.link.expired.title")} description={name ? t("err.link.expired.bodyShop", { shop: name }) : t("err.link.expired.body")} primary={call} secondary={home} />;
  if (kind === "rate")
    return (
      <FailScreen
        title={t("err.rate.title")}
        description={t("err.link.rate.body")}
        primary={
          <Button href={retryHref} variant="secondary">
            {t("err.action.retry")}
          </Button>
        }
        secondary={home}
      />
    );
  return (
    <FailScreen
      title={t("err.server.title")}
      description={t("err.server.body")}
      primary={
        <Button href={retryHref} variant="secondary">
          {t("err.action.retry")}
        </Button>
      }
      secondary={home}
    />
  );
}
