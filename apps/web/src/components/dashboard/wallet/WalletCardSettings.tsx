"use client";
/**
 * Settings, Wallet card: what the shop's customers carry in Apple Wallet and Google Wallet, with live previews built by the API
 * from the unsaved draft (POST /v1/merchants/:id/wallet-card/preview), so what the owner sees is what the pass will be.
 * Saving (PUT) refreshes every card already in a wallet. docs/engineering/wallet.md.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { walletApi } from "@ll/shared";
import { Panel, SaveBar } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useAction } from "@/lib/dashboard/useApi";
import { WalletCardPreviews } from "./WalletCardPreviews";

const HEX = /^#[0-9a-fA-F]{6}$/;
type Draft = { color: string; strip: "stamps" | "plain"; rewardText: string; showHours: boolean; showBooking: boolean; terms: string };

const toDraft = (s: walletApi.WalletCardSettings): Draft => ({ color: s.color ?? "", strip: s.strip ?? "stamps", rewardText: s.rewardText ?? "", showHours: s.showHours !== false, showBooking: s.showBooking !== false, terms: s.terms ?? "" });
/** Only what differs from the defaults is stored. */
const toBody = (d: Draft): walletApi.WalletCardSettings => ({
  ...(d.color ? { color: d.color.toUpperCase() } : {}),
  ...(d.strip !== "stamps" ? { strip: d.strip } : {}),
  ...(d.rewardText.trim() ? { rewardText: d.rewardText.trim() } : {}),
  ...(d.showHours ? {} : { showHours: false }),
  ...(d.showBooking ? {} : { showBooking: false }),
  ...(d.terms.trim() ? { terms: d.terms.trim() } : {}),
});

export function WalletCardSettings({ active = true }: { active?: boolean }) {
  const { api, detail } = useMerchant();
  const { t } = useLocaleOrEnglish();
  const toast = useToast();
  const act = useAction();
  const [data, setData] = useState<walletApi.WalletCardResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<walletApi.ShopPassModel | null>(null);
  const initial = useMemo(() => (data ? toDraft(data.settings) : null), [data]);

  useEffect(() => {
    let alive = true;
    api
      .walletCard()
      .then((r) => {
        if (!alive) return;
        setData(r);
        setDraft(toDraft(r.settings));
        setPreview(r.preview);
      })
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [api]);

  // Debounced preview of the draft (only when the colour is valid or empty).
  const seq = useRef(0);
  useEffect(() => {
    if (!draft || !initial) return;
    if (draft.color && !HEX.test(draft.color)) return;
    const n = ++seq.current;
    const h = setTimeout(() => {
      api
        .previewWalletCard(toBody(draft))
        .then((m) => n === seq.current && setPreview(m))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(h);
  }, [api, draft, initial]);

  if (loadError) return <Banner tone="warning">{loadError}</Banner>;
  if (!data || !draft || !preview || !initial) return <div aria-busy="true" className="skeleton h-[420px] w-full rounded-card" />;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const dirty = JSON.stringify(toBody(draft)) !== JSON.stringify(toBody(initial));
  const colorError = draft.color && !HEX.test(draft.color) ? t("dw.wcard.badColor") : undefined;
  const brand = detail.merchant.brandColor && HEX.test(detail.merchant.brandColor) ? detail.merchant.brandColor : null;
  const firstReward = data.preview.nextReward?.name ?? "";
  const carried = data.cardsInWallets.apple + data.cardsInWallets.google;
  const privatePlace = detail.locations.some((l) => l.addressVisibility !== "exact");

  async function save() {
    if (colorError || !draft) return;
    const r = await act.run(() => api.saveWalletCard(toBody(draft)));
    if (r) {
      setData(r);
      setDraft(toDraft(r.settings));
      setPreview(r.preview);
      toast({ message: t("dw.wcard.saved"), tone: "success" });
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="wallet-card-settings">
      <Panel title={t("dw.wcard.tab")} description={t("dw.wcard.intro")}>
        <div className="flex flex-col gap-3">
          {!data.availability.apple ? <Banner tone="neutral">{t("dw.wcard.notLive", { wallet: "Apple Wallet", company: "Apple" })}</Banner> : null}
          {!data.availability.google ? <Banner tone="neutral">{t("dw.wcard.notLive", { wallet: "Google Wallet", company: "Google" })}</Banner> : null}
          {carried > 0 ? <p className="text-meta text-fg-muted">{t("dw.wcard.carried", { n: carried })}</p> : null}
          <WalletCardPreviews m={preview} />
          <p className="text-meta text-fg-muted">{t("dw.wcard.sample")} {t("dw.wcard.scan")}</p>
          {privatePlace && preview.place ? <p className="text-meta text-fg-muted" data-testid="wallet-privacy-note">{t("dw.wcard.privacy", { place: preview.place })}</p> : null}
        </div>
      </Panel>

      <Panel title={t("dw.wcard.front")} description={t("dw.wcard.logoHint")}>
        <form id="wallet-card-form" className="flex flex-col gap-5" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <TextField label={t("dw.wcard.color")} value={draft.color || brand || ""} placeholder={brand ?? "#0B0B0C"} error={colorError} hint={t("dw.wcard.colorHint")} onChange={(e) => set("color", e.target.value.trim())} />
            </div>
            <input type="color" aria-label={t("dw.wcard.color")} value={HEX.test(draft.color) ? draft.color : (brand ?? "#0B0B0C")} onChange={(e) => set("color", e.target.value.toUpperCase())} className="mt-[26px] h-12 w-14 shrink-0 cursor-pointer rounded-input border border-line bg-bg p-1" />
          </div>
          {draft.color && brand && draft.color.toUpperCase() !== brand.toUpperCase() ? (
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => set("color", "")}>
                {t("dw.wcard.useBrand")}
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <span className="text-body-strong text-fg">{t("dw.wcard.strip")}</span>
            <SegmentedControl<"stamps" | "plain">
              label={t("dw.wcard.strip")}
              options={[{ value: "stamps", label: preview.kind === "stamps" ? t("dw.wcard.stripStamps") : t("dw.wcard.stripPoints") }, { value: "plain", label: t("dw.wcard.stripPlain") }]}
              value={draft.strip}
              onChange={(v) => set("strip", v)}
              className="self-start"
            />
          </div>
          <TextField label={t("dw.wcard.reward")} optionalLabel value={draft.rewardText} maxLength={40} hint={firstReward ? t("dw.wcard.rewardHint", { reward: firstReward }) : undefined} onChange={(e) => set("rewardText", e.target.value)} />
        </form>
      </Panel>

      <Panel title={t("dw.wcard.back")}>
        <div className="flex flex-col gap-1">
          <Switch label={t("dw.wcard.showHours")} checked={draft.showHours} onChange={(v) => set("showHours", v)} />
          <Switch label={t("dw.wcard.showBooking")} checked={draft.showBooking} onChange={(v) => set("showBooking", v)} />
          <div className="pt-3">
            <TextField type="textarea" label={t("dw.wcard.terms")} optionalLabel value={draft.terms} maxLength={500} showCount hint={t("dw.wcard.termsHint")} onChange={(e) => set("terms", e.target.value)} />
          </div>
        </div>
      </Panel>

      <SaveBar dirty={dirty && active} error={act.error} onDiscard={() => setDraft(initial)}>
        <Button type="submit" form="wallet-card-form" size="sm" loading={act.busy} disabled={!!colorError}>
          {t("dw.wcard.save")}
        </Button>
      </SaveBar>
    </div>
  );
}
