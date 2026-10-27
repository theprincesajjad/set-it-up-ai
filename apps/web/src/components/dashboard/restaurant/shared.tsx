"use client";
/**
 * Small pieces shared by the restaurant messaging pages (WhatsApp, reviews, festivals, phone orders):
 * the tier teaser for 402s and locked features, a copy-to-clipboard button and a few formatters.
 */
import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { FEATURES, RESTAURANT_PLANS, featureOffer, type FeatureKey } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PageHeader } from "../kit";
import { useMerchant } from "../MerchantContext";
import { SubscribeButton } from "../SubscribeButton";

/**
 * A restaurant feature the shop's tier does not include (the API answered 402, or the feature flag is off).
 * Names the restaurant tier that has it; owners get a link to the plans on the billing page.
 */
export function TierTeaser({ featureKey, title, description, inline, stacked }: { featureKey: FeatureKey; title?: string; description?: string; inline?: boolean; /** Narrow side panels: text above the action. */ stacked?: boolean }) {
  const { base, role } = useMerchant();
  const def = FEATURES[featureKey];
  const plan = RESTAURANT_PLANS[def.packTier ?? "starter"];
  const offer = featureOffer(featureKey);
  const body = (
    <div className={cn("flex flex-col gap-3 border-y border-line py-5", !stacked && "sm:flex-row sm:items-center sm:justify-between", inline ? "" : "max-w-[640px]")}>
      <div className="min-w-0">
        <p className="text-meta-strong text-fg">Included with {plan.name}</p>
        <p className="mt-0.5 text-meta text-fg-muted">
          {inline ? `${description ?? def.description} ` : ""}
          {plan.name} is ${plan.priceCents / 100} a month.
        </p>
      </div>
      {role === "owner" ? (
        <span className={cn("flex shrink-0 flex-col items-start gap-1.5 self-start", !stacked && "sm:self-auto")}>
          {offer.kind === "restaurant" ? <SubscribeButton offer={offer} label={`Subscribe to ${plan.name}`} /> : null}
          <a href={`${base}/billing`} className="text-meta text-fg-muted underline decoration-line underline-offset-4 hover:text-fg">
            See restaurant plans
          </a>
        </span>
      ) : (
        <p className="shrink-0 text-meta text-fg-muted">Ask the shop owner to upgrade.</p>
      )}
    </div>
  );
  if (inline) return body;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader flush title={title ?? def.name} description={description ?? def.description} />
      {body}
    </div>
  );
}

/** Wrap a page: renders the teaser when the shop doesn't have the feature, else the page. */
export function RestaurantGate({ featureKey, title, children }: { featureKey: FeatureKey; title?: string; children: ReactNode }) {
  const { enabled } = useMerchant();
  if (!enabled(featureKey)) return <TierTeaser featureKey={featureKey} title={title} />;
  return <>{children}</>;
}

/** Copy text to the clipboard; the label flips to "Copied" for two seconds. */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* clipboard blocked: the text stays visible to select by hand */
        }
      }}
      className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-input border border-line bg-bg px-3 text-meta font-medium text-fg hover:bg-bg-subtle focus-visible:focus-ring", className)}
    >
      {done ? <Check aria-hidden className="size-3.5 text-positive" strokeWidth={1.75} /> : <Copy aria-hidden className="size-3.5 text-fg-muted" strokeWidth={1.75} />}
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

/** "+14165550123" -> "+1 (416) 555-0123"; anything else is returned as is. */
export function formatPhone(p: string | null | undefined): string {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

/** "order_confirmed" -> "Order confirmed". */
export const sentence = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Toronto wall-clock time, e.g. "Oct 22, 6:12 p.m.". */
export function whenTor(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
