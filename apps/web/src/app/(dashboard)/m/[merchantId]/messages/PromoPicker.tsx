"use client";
/**
 * Promos to regulars (docs/business/people-side.md gap 6): seasonal templates for the shop's trade (in season first), the
 * regulars preselected, app push and email only, and the allowance counter ("1 of 4 this month"). A free shop sees the same
 * picker with the plan line and no Send button.
 */
import { useState } from "react";
import { PLANS, PROMOS_PER_MONTH_PLUS, type messagingApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { CardHead, SurfaceCard } from "@/components/ui/ClearKit";
import { Icon3d } from "@/components/ui/Icon3d";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export function PromoPicker({ standalone }: { /** On its own page under a page title that already says what it is. */ standalone?: boolean } = {}) {
  const { api, base, detail } = useMerchant();
  const { t, locale, date } = useLocaleOrEnglish();
  const toast = useToast();
  const state = useApi(() => api.regularsPromos.templates(locale), [api, locale]);
  const [pick, setPick] = useState<messagingApi.PromoTemplateDto | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [everyone, setEveryone] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentLine, setSentLine] = useState<string | null>(null);
  const d = state.data;
  const a = d?.allowance;
  const counter = a && a.limit > 0 ? t(a.period === "year" ? "promo.counterYear" : "promo.counter", { used: a.used, limit: a.limit }) : null;
  const canSend = !!a && a.remaining > 0;

  function choose(x: messagingApi.PromoTemplateDto) {
    setPick(x);
    setTitle(x.title);
    setBody(x.body);
    setSentLine(null);
  }

  async function send() {
    if (!pick) return;
    setSending(true);
    try {
      const r = await api.regularsPromos.send({ templateKey: pick.key, title: title.trim(), body: body.trim(), segment: everyone ? "all" : "regulars" });
      setSentLine(t("promo.sent", { n: r.result.recipients }));
      toast({ message: t("promo.sent", { n: r.result.recipients }), tone: "success" });
      setPick(null);
      await state.reload();
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <SurfaceCard as="section" aria-labelledby="promo-picker" data-testid="promo-picker">
      <CardHead id="promo-picker" title={t("promo.title")} action={counter ? <Badge tone="neutral"><span data-testid="promo-counter">{counter}</span></Badge> : null} />
      <div className="flex flex-col gap-4 px-4 pb-4">
        {standalone ? null : <p className="text-meta text-fg-muted">{t("promo.subtitle")}</p>}
        {d?.offer ? (
          <PlanLine href={`${base}/billing?plan=plus`} linkLabel={t("promo.planCta", { plan: d.offer.name })}>
            {t("promo.planLine", { plan: d.offer.name, count: PROMOS_PER_MONTH_PLUS })} {t("people.perMonth", { price: formatMoney(PLANS.plus.priceCents).replace(/\.00$/, "") })}
          </PlanLine>
        ) : null}
        {sentLine ? <Banner tone="success">{sentLine}</Banner> : null}
        {d?.last ? (
          <p className="text-meta text-fg" data-testid="promo-last">
            <span className="text-fg-muted">{t("promo.lastTitle")}: </span>
            {t("promo.result", { title: d.last.title, n: d.last.recipients, booked: d.last.booked })}
          </p>
        ) : null}
        {state.error ? <p className="text-meta text-negative">{state.error}</p> : null}
        {!d && !state.error ? <div className="h-40 animate-pulse rounded-r4 bg-bg-subtle" aria-hidden /> : null}
        {d && !d.items.length ? <p className="text-meta text-fg-muted">{t("promo.empty")}</p> : null}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={t("promo.title")}>
          {(d?.items ?? []).slice(0, 9).map((x) => (
            <li key={x.key}>
              <button
                type="button"
                onClick={() => choose(x)}
                aria-pressed={pick?.key === x.key}
                className={cn("flex h-full min-h-28 w-full flex-col gap-1 rounded-r4 border px-4 py-3 text-start focus-visible:focus-ring", pick?.key === x.key ? "border-foreground bg-row-sel" : "border-border hover:bg-bg-subtle")}
                data-testid={`promo-tpl-${x.key}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-body-strong text-fg">{x.title}</span>
                  <span className="shrink-0 text-caption text-fg-muted">{x.inSeason ? t("promo.inSeason") : t("promo.soon", { n: x.daysAway })}</span>
                </span>
                <span className="line-clamp-3 text-meta text-fg-muted">{x.body}</span>
                <span className="mt-auto text-caption text-fg-muted">{`${date(`${x.start}T12:00:00Z`, { month: "short", day: "numeric" })} – ${date(`${x.end}T12:00:00Z`, { month: "short", day: "numeric" })}`}</span>
              </button>
            </li>
          ))}
        </ul>
        {pick ? (
          <div className="flex flex-col gap-3 rounded-r4 border border-border p-4" data-testid="promo-editor">
            <div className="flex items-start gap-3">
              <Icon3d name="megaphone" size={40} trade={detail.merchant.vertical} className="shrink-0" />
              <p className="text-meta text-fg">{t("promo.audience", { n: d?.audience.regulars ?? 0 })}</p>
            </div>
            <TextField label={t("promo.fieldTitle")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
            <TextField type="textarea" label={t("promo.fieldBody")} value={body} onChange={(e) => setBody(e.target.value)} maxLength={180} showCount />
            <label className="flex min-h-11 items-center gap-2 text-meta text-fg">
              <input type="checkbox" className="size-4" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
              {t("promo.audienceAll")}
            </label>
            <p className="text-caption text-fg-muted">{t("promo.noTexts")}</p>
            {a && a.limit > 0 && a.remaining === 0 ? <Banner tone="warning">{t("promo.noneLeft", { date: date(new Date(new Date(a.periodStart).getTime() + (a.period === "year" ? 365 : 31) * 86_400_000), { month: "short", day: "numeric" }) })}</Banner> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPick(null)}>{t("promo.cancel")}</Button>
              {canSend ? (
                <Button size="sm" loading={sending} disabled={!title.trim() || !body.trim()} onClick={send} data-testid="promo-send">{t("promo.send")}</Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
