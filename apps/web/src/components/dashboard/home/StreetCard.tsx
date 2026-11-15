"use client";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useMerchant } from "../MerchantContext";

/**
 * Where the shop is: on the map, and on which street. The API pins the address and picks the street at signup; this card appears only
 * when one of the two did not work, and lets the owner fix it (try the address again, or ask for their street). Nothing shows when both are fine.
 */
export function StreetCard() {
  const { api, base, role, detail } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const state = useApi(role === "staff" ? null : () => api.street(), [api, role]);
  const act = useAction();
  const [name, setName] = useState("");
  const s = state.data;
  if (!s || (s.onMap && s.open)) return null;
  const owner = role === "owner";
  const work = detail.merchant.workSetting;
  // A pro who travels to clients has no address to pin, so there is nothing to fix here.
  if (!s.onMap && work === "mobile") return null;
  const home = work === "home";
  return (
    <section aria-label={t("own.street.label")} className="flex flex-col gap-3 rounded-card bg-card shadow-card p-5">
      <div className="flex items-start gap-3">
        <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" strokeWidth={1.75} />
        <div className="min-w-0">
          {!s.onMap ? (
            <>
              <h2 className="text-body-strong text-fg">{t("own.street.notOnMap")}</h2>
              <p className="mt-1 text-meta text-fg-muted">{t(home ? "own.street.notOnMapHome" : "own.street.notOnMapBody")}</p>
            </>
          ) : !s.neighbourhood ? (
            <>
              <h2 className="text-body-strong text-fg">{t("own.street.notLive")}</h2>
              <p className="mt-1 text-meta text-fg-muted">{t("own.street.notLiveBody", { n: s.opensAt })}</p>
            </>
          ) : (
            <>
              <h2 className="text-body-strong text-fg"><bdi>{t("own.street.hoodNotLive", { name: s.neighbourhood.name })}</bdi></h2>
              <p className="mt-1 text-meta text-fg-muted">{t("own.street.hoodBody", { shops: s.shops, n: s.opensAt })}</p>
            </>
          )}
        </div>
      </div>
      {act.error ? <Banner tone="warning">{act.error}</Banner> : null}
      {owner && !s.onMap ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={act.busy} onClick={async () => { const r = await act.run(() => api.locateShop()); if (r) state.setData(r); }}>{t("own.street.find")}</Button>
          <Button size="sm" variant="secondary" href={`${base}/locations`}>{t(home ? "own.street.checkHome" : "own.street.check")}</Button>
        </div>
      ) : null}
      {owner && s.onMap && !s.neighbourhood ? (
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={async (e) => { e.preventDefault(); const r = await act.run(() => api.requestStreet(name)); if (r) { state.setData(r); setName(""); } }}>
          <div className="min-w-0 flex-1">
            <TextField label={t("own.street.area")} placeholder="Lake Shore Village" dir="auto" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <Button type="submit" size="md" loading={act.busy} disabled={name.trim().length < 3}>{t("own.street.ask")}</Button>
        </form>
      ) : null}
    </section>
  );
}
