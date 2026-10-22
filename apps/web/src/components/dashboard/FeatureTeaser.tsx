"use client";
import { CalendarClock, FileText, Flag, Mail, MessageSquareText, ShoppingBag, Sparkles, Wrench, BarChart3, CreditCard, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { FEATURES, PLANS, type FeatureKey } from "@ll/shared";
import { LockedFeature } from "@/components/ui/LockedFeature";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { useMerchant } from "./MerchantContext";

const ICONS: Partial<Record<FeatureKey, LucideIcon>> = {
  "orders.order_ahead": ShoppingBag, "orders.pickup_status": ShoppingBag, "booking.pickup_slots": CalendarClock, "booking.dropoff_scheduling": CalendarClock,
  "service.tickets": Wrench, "service.quote_approval": FileText, "service.deposits": CreditCard, "service.invoices": FileText,
  "marketing.sms": MessageSquareText, "marketing.automations": Mail, "reports.advanced": BarChart3, "payments.in_app": CreditCard,
  "ads.sponsored_promo": Flag, "ads.sponsored_listing": Flag, "ads.map_pin": Flag, "promos.push_nearby": Sparkles,
};

/** ux-copy.md §5 one-liners. */
export const TEASER_COPY: Partial<Record<FeatureKey, string>> = {
  "orders.order_ahead": "Customers order and pay before they arrive, and get a text when it's ready.",
  "service.tickets": "Track every repair from drop-off to pickup, with photos and status updates.",
  "service.quote_approval": "Send a quote; your customer approves it on their phone. No more phone tag.",
  "service.invoices": "Send the final bill and get paid in the app. Customers earn points automatically.",
  "marketing.sms": "Text your opted-in regulars. 500 texts a month included with Plus.",
  "marketing.automations": "\"We miss you\" and \"Your reward is ready\" messages that send themselves.",
  "ads.sponsored_promo": "Show your offer to people near your street. Always labelled Sponsored.",
  "reports.advanced": "See how many new members come back month after month.",
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

/**
 * LockedFeature for one feature key, in the right state (system.md §6):
 * hidden → Coming soon + Notify me; beta → Try the beta (owners opt in); plan → Available on Plus.
 * Renders nothing when the feature is enabled.
 */
export function FeatureTeaser({ featureKey, title, description }: { featureKey: FeatureKey; title?: string; description?: string }) {
  const { feature, role, api, refresh, base } = useMerchant();
  const toast = useToast();
  const shops = useNetworkShops();
  const [notified, setNotified] = useState(false);
  useEffect(() => {
    // localStorage is client-only; read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotified(notifiedKeys().includes(featureKey));
  }, [featureKey]);
  const f = feature(featureKey);
  const def = FEATURES[featureKey];
  if (!f || f.enabled) return null;
  const state = f.lockedReason === "plan" && f.stage !== "hidden" ? "plan" : f.stage === "beta" ? "beta" : "hidden";
  const plan = PLANS[def.minPlan];
  return (
    <LockedFeature
      key={`${featureKey}-${notified}`}
      icon={ICONS[featureKey] ?? Sparkles}
      title={title ?? f.name}
      description={description ?? TEASER_COPY[featureKey] ?? f.description}
      state={state}
      planLabel={`Available on ${plan.name} · $${plan.priceCents / 100}/mo`}
      network={state === "hidden" && def.unlockAtMerchants > 0 && shops != null ? { current: Math.min(shops, def.unlockAtMerchants), target: def.unlockAtMerchants } : null}
      notified={notified}
      onNotify={async () => {
        // POST .../features/:key/notify records interest; also remembered locally so the button state survives reloads.
        await api.notifyFeature(featureKey).catch(() => undefined);
        try {
          localStorage.setItem(NOTIFY_KEY, JSON.stringify([...new Set([...notifiedKeys(), featureKey])]));
        } catch {
          /* private mode */
        }
        setNotified(true);
      }}
      onTryBeta={
        role === "owner"
          ? async () => {
              try {
                await api.setBeta(true);
                await refresh();
                toast({ message: "You're in the beta. New tools appear in your menu.", tone: "success" });
              } catch (e) {
                toast({ message: errorMessage(e), tone: "error" });
              }
            }
          : undefined
      }
      seePlansHref={role === "owner" ? `${base}/billing` : undefined}
    />
  );
}
