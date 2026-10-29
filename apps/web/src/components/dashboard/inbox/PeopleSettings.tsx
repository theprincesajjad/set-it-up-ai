"use client";
/**
 * Settings > Messages and Instagram (phase solo, workstream D): the Instagram card ("coming" until the connector is switched on),
 * how reminders and messages reach customers (the ladder, the month's texts), the one intake question per service, and, for a
 * solo pro on Free, the "Add a second chair" plan line.
 */
import { useState } from "react";
import { PLANS } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardHead, Row, Rows, SurfaceCard } from "@/components/ui/ClearKit";
import { Icon3d } from "@/components/ui/Icon3d";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/format";
import { useSoloCalendar } from "@/lib/dashboard/useSoloCalendar";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export function PeopleSettings() {
  const { enabled, features, base } = useMerchant();
  const solo = useSoloCalendar();
  const { t } = useLocaleOrEnglish();
  const free = features.plan === "free";
  return (
    <div className="flex flex-col gap-4">
      <InstagramCard />
      <ChannelCard />
      <SurfaceCard>
        <Rows ruleTop={false}>
          <Row href={`${base}/messages/promos`} title={t("promo.title")} subtitle={t("promo.subtitle")} />
        </Rows>
      </SurfaceCard>
      {enabled("booking.appointments") ? <IntakeCard /> : null}
      {solo && free ? (
        <SurfaceCard padded data-testid="second-chair">
          <p className="text-headline text-fg">{t("people.addChair")}</p>
          <PlanLine className="mt-1" href={`${base}/billing`} linkLabel={t("promo.planCta", { plan: PLANS.plus.name })}>
            {t("people.addChairBody")} {t("people.perMonth", { price: formatMoney(PLANS.plus.priceCents) })}
          </PlanLine>
        </SurfaceCard>
      ) : null}
    </div>
  );
}

function InstagramCard() {
  const { api, detail, base } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const toast = useToast();
  const status = useApi(() => api.instagram.status(), [api]);
  const [busy, setBusy] = useState(false);
  const s = status.data;
  async function connect() {
    setBusy(true);
    try {
      const r = await api.instagram.connect();
      if (r.authorizeUrl) {
        window.location.href = r.authorizeUrl;
        return;
      }
      toast({ message: t("ig.card.imported", { n: r.imported }), tone: "success" });
      await status.reload();
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    try {
      await api.instagram.disconnect();
      toast({ message: t("ig.card.disconnected"), tone: "success" });
      await status.reload();
    } catch (e) {
      toast({ message: errorMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <SurfaceCard as="section" aria-labelledby="ig-card" data-testid="instagram-card">
      <CardHead id="ig-card" title={t("ig.card.title")} action={s?.mode === "off" ? <Badge>{t("ig.card.coming")}</Badge> : s?.connected ? <Badge tone="success">@{s.username}</Badge> : null} />
      <div className="flex flex-col gap-3 px-4 pb-4 sm:flex-row sm:items-start">
        <Icon3d name="instagram_mark" size={64} trade={detail.merchant.vertical} className="shrink-0" />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-body text-fg">{t("ig.card.body")}</p>
          {s?.mode === "off" ? <p className="text-meta text-fg-muted">{t("ig.card.comingBody")}</p> : null}
          {s?.mode === "stub" ? <p className="text-meta text-fg-muted">{t("ig.card.stub")}</p> : null}
          <p className="text-caption text-fg-muted">{t("ig.card.keeps")}</p>
          {s && s.mode !== "off" ? (
            <div className="flex flex-wrap items-center gap-2">
              {s.connected ? (
                <>
                  <span className="text-meta text-fg">{t("ig.card.connected", { username: s.username ?? "" })}</span>
                  <a className="inline-flex min-h-11 items-center text-meta text-link underline underline-offset-4" href={`${base}/inbox?c=`}>{t("inbox.title")}</a>
                  <Button size="sm" variant="secondary" loading={busy} onClick={disconnect}>{t("ig.card.disconnect")}</Button>
                </>
              ) : (
                <Button size="sm" loading={busy} onClick={connect} data-testid="ig-connect">{t("ig.card.connect")}</Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </SurfaceCard>
  );
}

function ChannelCard() {
  const { api } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const usage = useApi(() => api.messages.smsUsage(), [api]);
  return (
    <SurfaceCard as="section" aria-labelledby="people-channels">
      <CardHead id="people-channels" title={t("people.settings.title")} />
      <div className="flex flex-col gap-2 px-4 pb-4">
        <p className="text-body text-fg">{t("people.settings.body")}</p>
        <ol className="flex flex-wrap gap-2 text-meta text-fg" aria-label={t("people.settings.title")}>
          {[t("people.reach.push"), t("people.reach.webPush"), t("people.reach.email"), t("people.reach.text")].map((r, i) => (
            <li key={r} className="inline-flex h-8 items-center rounded-full bg-bg-subtle px-3">{`${i + 1}. ${r}`}</li>
          ))}
        </ol>
        {usage.data ? <p className="text-meta text-fg-muted tabular">{t("people.settings.texts", { used: usage.data.used, limit: usage.data.allowance })}</p> : null}
        <p className="text-caption text-fg-muted">{t("promo.noTexts")}</p>
      </div>
    </SurfaceCard>
  );
}

function IntakeCard() {
  const { api } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const toast = useToast();
  const list = useApi(() => api.people.intakeQuestions(), [api]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  if (!list.data?.items.length) return null;
  return (
    <SurfaceCard as="section" aria-labelledby="people-intake">
      <CardHead id="people-intake" title={t("people.intakeQuestion")} />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <p className="text-meta text-fg-muted">{t("people.intakeQuestionHint")}</p>
        {list.data.items.map((s) => {
          const value = draft[s.serviceId] ?? s.question ?? "";
          const dirty = value !== (s.question ?? "");
          return (
            <div key={s.serviceId} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <TextField className="flex-1" label={s.name} value={value} maxLength={200} placeholder={t("people.intakePlaceholder")} onChange={(e) => setDraft((d) => ({ ...d, [s.serviceId]: e.target.value }))} />
              <Button
                size="sm"
                variant="secondary"
                disabled={!dirty}
                loading={saving === s.serviceId}
                onClick={async () => {
                  setSaving(s.serviceId);
                  try {
                    await api.people.setIntakeQuestion(s.serviceId, value.trim() || null);
                    await list.reload();
                    toast({ message: t("people.pref.saved"), tone: "success" });
                  } catch (e) {
                    toast({ message: errorMessage(e), tone: "error" });
                  } finally {
                    setSaving(null);
                  }
                }}
              >
                {t("people.save")}
              </Button>
            </div>
          );
        })}
      </div>
    </SurfaceCard>
  );
}
