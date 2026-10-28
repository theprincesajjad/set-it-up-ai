"use client";
import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FEATURES, PLANS, featureOffer, type FeatureKey } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useMerchant } from "./MerchantContext";
import { SubscribeButton } from "./SubscribeButton";

/** ux-copy.md §5 one-liners. */
export const TEASER_COPY: Partial<Record<FeatureKey, string>> = {
  "orders.order_ahead": "Customers order and pay before they arrive, and get a text when it's ready.",
  "service.tickets": "Track every repair from drop-off to pickup, with photos and status updates.",
  "service.quote_approval": "Send a quote; your customer approves it on their phone. No more phone tag.",
  "service.invoices": "Send the final bill and get paid in the app. Customers earn points automatically.",
  "promos.basic": "Post offers like double rewards on a slow afternoon.",
  "discount_cards": "Show-to-save cards for students, seniors or your street.",
  "marketing.email": "Email your opted-in regulars, CASL compliant.",
  "marketing.sms": `Text your opted-in regulars. 500 texts a month included with ${PLANS.plus.name}.`,
  "marketing.automations": "\"We miss you\" and \"Your reward is ready\" messages that send themselves.",
  "integrations.pos_auto_award": "Award points automatically from Square, Clover and more.",
  "integrations.webhooks": "Webhooks, Zapier and the merchant API.",
  "customers.csv_export": "Export your customers and their activity.",
  "customers.csv_import": "Bring your members over from another loyalty app.",
  "ads.sponsored_promo": "Show your offer to people near your street. Always labelled Sponsored.",
  "reports.advanced": "Retention cohorts and which shops your customers also visit.",
};

let networkShops: Promise<number> | null = null;
/** Shops on the network (sum of neighbourhood shop counts, public endpoint), cached per page load. */
export function useNetworkShops(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    networkShops ??= browserApi.network.neighbourhoods().then((r) => r.items.reduce((s, x) => s + x.shopCount, 0)).catch(() => 0);
    let live = true;
    void networkShops.then((v) => live && setN(v));
    return () => {
      live = false;
    };
  }, []);
  return n;
}

const NOTIFY_KEY = "ll.notify";
function notifiedKeys(): string[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFY_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** "Notify me" for coming-soon features: POST .../features/:key/notify for each key, remembered locally. */
export function useNotify(keys: FeatureKey[]) {
  const { api } = useMerchant();
  const id = keys.join(",");
  const [notified, setNotified] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // localStorage is client-only; read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotified(id.split(",").every((k) => notifiedKeys().includes(k)));
  }, [id]);
  const notify = useCallback(async () => {
    setBusy(true);
    const ks = id.split(",") as FeatureKey[];
    await Promise.all(ks.map((k) => api.notifyFeature(k).catch(() => undefined)));
    try {
      localStorage.setItem(NOTIFY_KEY, JSON.stringify([...new Set([...notifiedKeys(), ...ks])]));
    } catch {
      /* private mode */
    }
    setNotified(true);
    setBusy(false);
  }, [api, id]);
  return { notified, busy, notify };
}

/** Text-only Notify me / We'll let you know. */
export function NotifyLink({ keys, className }: { keys: FeatureKey[]; className?: string }) {
  const { notified, busy, notify } = useNotify(keys);
  return notified ? (
    <span className={cn("inline-flex items-center gap-1 text-meta text-muted-foreground", className)}>
      <Check aria-hidden className="size-3.5" /> We&apos;ll let you know
    </span>
  ) : (
    <button type="button" disabled={busy} onClick={() => void notify()} className={cn("rounded-sm text-meta font-medium text-foreground underline decoration-line underline-offset-4 hover:decoration-fg focus-visible:focus-ring", className)}>
      Notify me
    </button>
  );
}

/**
 * Quiet notice for a paid feature reached by deep link (sidebar never shows it while locked).
 * hidden → coming soon + Notify me; beta → owners can opt in; plan → see plans (owners).
 * Renders nothing when the feature is enabled.
 */
export function FeatureTeaser({ featureKey, title, description }: { featureKey: FeatureKey; title?: string; description?: string }) {
  const { feature, role, api, refresh, base, detail } = useMerchant();
  const toast = useToast();
  const shops = useNetworkShops();
  const f = feature(featureKey);
  const def = FEATURES[featureKey];
  if (!f || f.enabled) return null;
  const offer = featureOffer(featureKey);
  const vertical = detail.merchant.vertical;
  const verticals = def.vertical ? (typeof def.vertical === "string" ? [def.vertical] : [...def.vertical]) : null;
  const wrongTrade = !!verticals && !verticals.includes(vertical);
  // A network-wide extra waits for the 100-shop gate; a trade tool is bought on its plan; anything else an admin paused is "coming soon".
  const state = offer.kind === "network" || f.stage === "hidden" ? "hidden" : f.stage === "beta" && !detail.merchant.betaOptIn ? "beta" : "plan";
  const status =
    wrongTrade
      ? "Built for another kind of shop"
      : state === "hidden"
        ? offer.kind === "network"
          ? `Opens once ${offer.unlockAtMerchants} shops have joined${shops != null ? ` (${shops} so far)` : ""}`
          : "Coming soon"
        : state === "beta"
          ? "In beta"
          : offer.kind === "plan" || offer.kind === "restaurant"
            ? `On ${offer.name} · $${offer.priceCents / 100} a month`
            : "Not on your plan";
  return (
    // Same top and order as every page header (title, one line, then the state) — polish-audit D15.
    <div className="max-w-[560px]">
      <h1 className="text-title font-semibold text-foreground">{title ?? f.name}</h1>
      <p className="mt-1 text-body text-muted-foreground">{description ?? TEASER_COPY[featureKey] ?? f.description}</p>
      <p className="mt-3 text-meta text-muted-foreground">{status}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {!wrongTrade && state === "hidden" ? <NotifyLink keys={[featureKey]} /> : null}
        {!wrongTrade && state === "plan" && (offer.kind === "plan" || offer.kind === "restaurant") ? (role === "owner" ? <SubscribeButton offer={offer} /> : <span className="text-meta text-muted-foreground">Ask the shop owner to subscribe.</span>) : null}
        {state === "beta" && role === "owner" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                await api.setBeta(true);
                await refresh();
                toast({ message: "You're in the beta. New tools appear in your menu.", tone: "success" });
              } catch (e) {
                toast({ message: errorMessage(e), tone: "error" });
              }
            }}
          >
            Try the beta
          </Button>
        ) : null}
        {role === "owner" ? (
          <a href={`${base}/billing`} className="text-meta text-muted-foreground hover:text-foreground">
            See plans
          </a>
        ) : null}
        <a href={base} className="text-meta text-muted-foreground hover:text-foreground">
          Back to home
        </a>
      </div>
    </div>
  );
}
