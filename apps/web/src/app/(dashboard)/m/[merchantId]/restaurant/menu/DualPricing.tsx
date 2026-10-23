"use client";
import { useEffect, useState } from "react";
import { Panel } from "@/components/dashboard";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { bpsToPct } from "@/components/dashboard/restaurant/common";
import { TierTeaser } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

/** Quebec postal codes start with G, H or J. */
const isQuebec = (postal: string | null | undefined) => !!postal && /^[GHJ]/i.test(postal.trim());

/** Cash discount card (Pro): a slider from 0 to 10%, with the two prices side by side. Owner-only to change. */
export function DualPricing({ sampleCents }: { sampleCents: number }) {
  const { api, enabled, role, detail } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const on = enabled("restaurant.dual_pricing");
  const state = useApi(on ? () => api.menuSettings.dualPricing() : null, [api, on]);
  const saved = state.data?.cashDiscountBps ?? 0;
  const [bps, setBps] = useState(0);
  useEffect(() => {
    // Follow the server value when it loads or changes after a save.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.data) setBps(state.data.cashDiscountBps);
  }, [state.data]);

  const quebec = detail.locations.some((l) => isQuebec(l.postalCode));
  const canEdit = role === "owner" && !quebec;
  const card = sampleCents;
  const cash = Math.round(card * (1 - bps / 10_000));
  const dirty = bps !== saved;

  if (!on) {
    return (
      <Panel title="Cash price">
        <TierTeaser featureKey="restaurant.dual_pricing" inline stacked />
      </Panel>
    );
  }

  return (
    <Panel
      title="Cash price"
      description="Show a lower price for guests who pay cash. Card prices stay as you set them."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-meta text-fg-muted" aria-live="polite">
            {saved > 0 ? `On: ${bpsToPct(saved)} off for cash` : "Off"}
          </p>
          <Button
            size="sm"
            disabled={!canEdit || !dirty}
            loading={act.busy}
            onClick={async () => {
              const r = await act.run(() => api.menuSettings.saveDualPricing(bps));
              if (r) {
                state.setData(r);
                toast({ message: r.enabled ? `Cash price on: ${bpsToPct(r.cashDiscountBps)} off` : "Cash price turned off", tone: "success" });
              }
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="cash-discount" className="text-meta-strong text-fg">
              Cash discount
            </label>
            <output htmlFor="cash-discount" className="text-headline tabular text-fg">
              {bpsToPct(bps)}
            </output>
          </div>
          <input
            id="cash-discount"
            type="range"
            min={0}
            max={1000}
            step={50}
            value={bps}
            disabled={!canEdit}
            onChange={(e) => setBps(Number(e.target.value))}
            aria-valuetext={`${bpsToPct(bps)} off for cash`}
            className="mt-3 h-6 w-full cursor-pointer accent-[var(--ll-color-fg)] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="mt-1 flex justify-between text-caption text-fg-subtle">
            <span>0%</span>
            <span>10%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-line rounded-card border border-line rtl:divide-x-reverse" aria-label="Price preview">
          <div className="px-4 py-3">
            <p className="text-meta text-fg-muted">Card</p>
            <p className="mt-1 text-title tabular text-fg">{formatMoney(card)}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-meta text-fg-muted">Cash</p>
            <p className="mt-1 text-title tabular text-fg">{formatMoney(cash)}</p>
            <p className="text-caption text-fg-muted tabular">{bps > 0 ? `${formatMoney(card - cash)} less` : "Same price"}</p>
          </div>
        </div>
        <p className="-mt-2 text-caption text-fg-muted">Preview on a {formatMoney(sampleCents)} dish before tax.</p>

        {quebec ? (
          <Banner tone="warning">Cash discount pricing isn&apos;t available for shops in Quebec, so it stays off here.</Banner>
        ) : (
          <p className="text-meta text-fg-muted">Not available in Quebec. Only the owner can change this.</p>
        )}
      </div>
    </Panel>
  );
}
