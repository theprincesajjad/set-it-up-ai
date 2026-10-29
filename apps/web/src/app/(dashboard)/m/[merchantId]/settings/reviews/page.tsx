"use client";
import { useEffect, useState } from "react";
import { PLANS } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { CardHead, PageTitle, SurfaceCard } from "@/components/ui/ClearKit";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserClient } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { appointmentReviewsApi, looksLikeLink } from "@/lib/dashboard/reviews";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { formatMoney } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

/**
 * Settings, Reviews (phase-pro P4): the Google review link, the switch for asking after every visit, and the last 30 days.
 * On Free the switch is locked behind a quiet plan line; the link still saves so it is ready the day Pro starts.
 */
export default function ReviewSettingsPage() {
  const { merchantId, base, role } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const toast = useToast();
  const api = appointmentReviewsApi(browserClient, merchantId);
  const state = useApi(() => api.settings(), [merchantId]);
  const save = useAction();
  const d = state.data;
  const [link, setLink] = useState("");
  const [touched, setTouched] = useState(false);
  const canEdit = role === "owner" || role === "manager";

  useEffect(() => {
    // Seed the field once the saved link arrives; the owner's typing wins after that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d && !touched) setLink(d.googleReviewUrl ?? "");
  }, [d, touched]);

  const invalid = !looksLikeLink(link);
  const dirty = !!d && link.trim() !== (d.googleReviewUrl ?? "");
  const noLink = !!d && !d.googleReviewUrl && !link.trim();

  async function saveLink() {
    const r = await save.run(() => api.save({ googleReviewUrl: link.trim() || null }));
    if (r) {
      state.setData(r);
      setTouched(false);
      toast({ message: t("revreq.linkSaved"), tone: "success" });
    }
  }
  async function flip(on: boolean) {
    try {
      state.setData(await api.save({ mode: on ? "on" : "off" }));
    } catch (e) {
      toast({ message: errorMessage(e) || t("revreq.saveError"), tone: "error" });
    }
  }

  return (
    <div className="flex max-w-[860px] flex-col gap-6 pb-20" data-testid="review-settings">
      <PageTitle title={t("revreq.title")} subtitle={t("revreq.sub")} />
      {state.error && !d ? <Banner tone="danger">{t("revreq.loadError")}</Banner> : null}
      {d ? (
        <>
          <SurfaceCard as="section" aria-labelledby="rv-switch">
            <CardHead id="rv-switch" title={t("revreq.switch")} />
            <div className="flex flex-col gap-3 px-4 pb-4">
              {d.available ? (
                <Switch checked={d.mode === "on"} onChange={(v) => void flip(v)} disabled={!canEdit} label={t("revreq.switch")} description={t("revreq.switchHint")} />
              ) : (
                <div data-testid="review-locked">
                  <PlanLine href={`${base}/billing`} linkLabel={t("promo.planCta", { plan: PLANS.plus.name })}>
                    {t("revreq.lockedBody")} {t("people.perMonth", { price: formatMoney(PLANS.plus.priceCents) })}
                  </PlanLine>
                </div>
              )}
              <p className="text-meta text-fg-muted" data-testid="review-last30">
                {t("revreq.last30", { asked: d.last30.asked, google: d.last30.google, notes: d.last30.privateNotes })}
              </p>
            </div>
          </SurfaceCard>

          <SurfaceCard as="section" aria-labelledby="rv-link">
            <CardHead id="rv-link" title={t("revreq.linkLabel")} />
            <form
              className="flex flex-col gap-4 px-4 pb-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!invalid) void saveLink();
              }}
            >
              <TextField
                label={t("revreq.linkLabel")}
                type="url"
                inputMode="url"
                dir="ltr"
                autoComplete="off"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setTouched(true);
                }}
                hint={t("revreq.linkHelp")}
                error={invalid ? t("revreq.linkInvalid") : undefined}
                disabled={!canEdit}
                placeholder="https://g.page/r/…"
                optionalLabel={false}
              />
              {noLink ? (
                <div data-testid="review-nolink">
                  <Banner tone="warning">{t("revreq.linkWarn")}</Banner>
                </div>
              ) : null}
              {save.error ? <Banner tone="danger">{save.error}</Banner> : null}
              <div>
                <Button type="submit" loading={save.busy} disabled={!canEdit || !dirty || invalid}>
                  {t("revreq.linkSave")}
                </Button>
              </div>
            </form>
          </SurfaceCard>
        </>
      ) : null}
    </div>
  );
}
