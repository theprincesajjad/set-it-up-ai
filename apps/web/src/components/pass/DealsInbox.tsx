"use client";
/**
 * The Deals inbox on /me (wave N, promo team): running deals from shops the person joined (and door crashers counting down),
 * the live spot counter, "Save my spot", and per-shop consent for deal messages (CASL: express consent, named sender, stop any
 * time). Opening the inbox counts the shown deals as opened for the shop's results.
 */
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { promosApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { DealCard } from "./DealCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";

export function DealsInbox() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const { t } = useLocaleOrEnglish();
  const params = useSearchParams();
  const focus = params.get("deal");
  const [items, setItems] = useState<promosApi.DealDto[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consentNote, setConsentNote] = useState<string | null>(null);

  const load = useCallback(() => browserApi.me.deals().then((r) => setItems(r.items)).catch(() => setItems([])), []);
  useEffect(() => {
    void load();
    // Refresh the live counters every 30 seconds while the page is open.
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  // Seen = opened (results). Once per load, for the unread ones.
  useEffect(() => {
    for (const d of items ?? []) if (d.unread) void browserApi.me.openDeal(d.id).catch(() => undefined);
  }, [items]);

  // Scroll a notification's deal into view.
  useEffect(() => {
    if (focus && items?.some((d) => d.id === focus)) document.querySelector(`[data-deal-id="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: "center" });
  }, [focus, items]);

  const shops = useMemo(() => {
    const m = new Map<string, promosApi.DealDto>();
    for (const d of items ?? []) if (d.memberId && !m.has(d.merchant.id)) m.set(d.merchant.id, d);
    return [...m.values()];
  }, [items]);

  async function claim(d: promosApi.DealDto) {
    setBusy(d.id);
    setErrors((e) => ({ ...e, [d.id]: "" }));
    try {
      const r = await browserApi.me.claimDeal(d.id);
      setItems((xs) => (xs ?? []).map((x) => (x.id === d.id ? { ...x, claim: r.claim, remaining: r.remaining } : x)));
    } catch (e) {
      setErrors((x) => ({ ...x, [d.id]: errorMessage(e) || t("deal.error") }));
      void load();
    } finally {
      setBusy(null);
    }
  }

  async function setConsent(d: promosApi.DealDto, on: boolean) {
    if (!d.memberId) return;
    setBusy(`consent:${d.merchant.id}`);
    try {
      if (on) await browserApi.me.grantConsent(d.memberId, t("deal.consentText", { shop: d.merchant.name }));
      else await browserApi.me.withdrawConsent(d.memberId);
      setConsentNote(on ? null : t("deal.optedOut", { shop: d.merchant.name }));
      setItems((xs) => (xs ?? []).map((x) => (x.merchant.id === d.merchant.id ? { ...x, optedIn: on } : x)));
    } catch {
      setConsentNote(t("deal.error"));
    } finally {
      setBusy(null);
    }
  }

  // wave-q: a skeleton of the inbox while the deals load (it used to pop in from nothing and push the page down).
  if (items === null)
    return (
      <div aria-busy className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-28 w-full rounded-card" />
      </div>
    );
  return (
    <section aria-labelledby="deals-h" className="flex flex-col gap-3" data-testid="deals-inbox">
      <div>
        <h2 id="deals-h" className="text-headline text-fg">
          {t("deal.title")}
        </h2>
        <p className="text-meta text-fg-muted">{items.length ? t("deal.intro") : t("deal.empty")}</p>
      </div>
      {items.map((d) => (
        <DealCard key={d.id} deal={d} onClaim={() => void claim(d)} claiming={busy === d.id} error={errors[d.id] || null} highlight={focus === d.id} />
      ))}
      {shops.length ? (
        <div className="flex flex-col gap-1 rounded-card border border-line bg-card px-4 py-3">
          {/* wave-p: a real switch (it read as a plain line of text before): on means this shop may send offers. */}
          {shops.map((d) => (
            <div key={d.merchant.id} data-testid="deal-consent">
              <Switch label={t("deal.optIn", { shop: d.merchant.name })} checked={!!d.optedIn} disabled={busy === `consent:${d.merchant.id}`} onChange={(on) => void setConsent(d, on)} />
            </div>
          ))}
          <p className="text-meta text-fg-muted">{t("deal.limits")}</p>
          {consentNote ? <p role="status" className="text-meta text-fg">{consentNote}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
