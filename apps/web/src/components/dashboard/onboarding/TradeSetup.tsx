"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { FEATURES, RESTAURANT_PLANS, featureOffer, type FeatureKey, type TradeSetupFamily } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { recommendedRestaurantTier } from "@/lib/signupRoute";
import { useMerchant } from "../MerchantContext";
import { SubscribeButton } from "../SubscribeButton";
import { TaxStatus } from "../TaxStatus";

/** What each trade's first step says: the page title, one line, and the feature that turns its tools on. */
export const TRADE_COPY: Record<TradeSetupFamily, { title: string; body: string; feature: FeatureKey }> = {
  menu: { title: "Add your menu", body: "Your menu is what customers see first. Pick the plan that turns on ordering, then add your dishes.", feature: "restaurant.commission_free" },
  services: { title: "Services, hours and tax", body: "List what you offer and what it costs, check your hours, say whether you charge HST, and share your booking link.", feature: "booking.appointments" },
  classes: { title: "Add your classes", body: "Add your class schedule and prices, check your hours and say whether you charge HST. Students book from your link.", feature: "booking.classes" },
  catalog: { title: "Add your price list", body: "Put your items and prices online so customers can order ahead, then post your first weekly flyer.", feature: "grocery.flyer" },
};

function Row({ done, title, children }: { done?: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 border-t border-line py-4 first:border-t-0 first:pt-0">
      <p className="flex items-center gap-2 text-body-strong text-fg">
        <span aria-hidden className={done ? "inline-flex size-[18px] items-center justify-center rounded-full bg-fg text-bg" : "inline-flex size-[18px] rounded-full border border-line-strong"}>
          {done ? <Check className="size-3" strokeWidth={2.5} /> : null}
        </span>
        {title}
      </p>
      <div className="ps-[26px]">{children}</div>
    </li>
  );
}

/**
 * The trade's own setup (menu for restaurants, services for salons, classes for studios, a price list for grocers):
 * the plan that turns the tools on (with a Subscribe button), then each page to fill in. Founder decision 2026-10-27.
 */
export function TradeSetup({ family, done }: { family: TradeSetupFamily; done: boolean }) {
  const { base, enabled, role, detail } = useMerchant();
  const [copied, setCopied] = useState(false);
  const vertical = detail.merchant.vertical;
  const c = TRADE_COPY[family];
  const on = enabled(c.feature) || (family === "menu" && enabled("restaurant.commission_free"));
  const offer = family === "menu" ? featureOffer("restaurant.commission_free") : featureOffer(c.feature);
  // Repair shops write tickets and quotes: that is the Service plan ($99), not Café & Retail.
  const repair = ["repair_electronics", "alterations", "print_shop", "dry_cleaning"].includes(vertical);
  const owner = role === "owner";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const slug = detail.merchant.slug;
  const link = family === "classes" ? `${origin}/shops/${slug}/classes` : family === "menu" ? `${origin}/shops/${slug}/menu` : family === "catalog" ? `${origin}/shops/${slug}/order` : `${origin}/shops/${slug}/book`;
  const tier = recommendedRestaurantTier(vertical);
  const planOffer = family === "menu" ? featureOffer(tier === "growth" ? "restaurant.tiffin" : tier === "pro" ? "restaurant.banquet" : "restaurant.commission_free") : repair ? featureOffer("service.tickets") : offer;
  const subscribeOffer = planOffer.kind === "plan" || planOffer.kind === "restaurant" ? planOffer : null;

  return (
    <ul className="flex flex-col">
      <Row done={on} title={family === "menu" ? "Pick your plan" : "Turn on your tools"}>
        {on ? (
          <p className="text-meta text-fg-muted">Your tools are on.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-meta text-fg-muted">
              {family === "menu"
                ? `${vertical === "tiffin" || vertical === "caterer" ? "Tiffin and catering are on" : vertical === "banquet_hall" ? "Banquet halls are on" : "Ordering is on"} ${RESTAURANT_PLANS[tier].name}, $${RESTAURANT_PLANS[tier].priceCents / 100} a month. Cancel any time.`
                : `${FEATURES[c.feature].name} is on ${subscribeOffer?.name ?? "a paid plan"}, $${(subscribeOffer?.priceCents ?? 0) / 100} a month. Cancel any time.`}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {owner && subscribeOffer ? <SubscribeButton offer={subscribeOffer} size="md" /> : <span className="text-meta text-fg-muted">Ask the shop owner to subscribe.</span>}
              <a className="text-meta text-fg-muted underline underline-offset-4 hover:text-fg" href={`${base}/billing`}>See all plans</a>
            </div>
          </div>
        )}
      </Row>
      <Row done={done} title={family === "menu" ? "Add your dishes" : family === "classes" ? "Add your classes" : family === "catalog" ? "Add your items and prices" : "Services and prices"}>
        <Button variant={on ? "primary" : "secondary"} size="sm" href={`${base}${family === "menu" ? "/restaurant/menu" : family === "classes" ? "/classes" : family === "catalog" ? "/catalog" : "/services"}`} disabled={!on}>
          {family === "menu" ? "Open the menu" : family === "classes" ? "Open the class schedule" : family === "catalog" ? "Open the price list" : "Open services and prices"}
        </Button>
        {!on ? <p className="mt-1.5 text-caption text-fg-muted">Turns on with your plan.</p> : null}
      </Row>
      {family === "menu" && ["tiffin", "caterer", "banquet_hall"].includes(vertical) ? (
        <>
          <Row title={vertical === "tiffin" ? "Your tiffin plans and routes" : vertical === "caterer" ? "Catering packages and quotes" : "Your hall, packages and deposits"}>
            <Button variant="secondary" size="sm" href={`${base}/restaurant/${vertical === "tiffin" ? "tiffin" : vertical === "caterer" ? "catering" : "banquet"}`} disabled={!enabled(vertical === "tiffin" ? "restaurant.tiffin" : vertical === "caterer" ? "restaurant.catering" : "restaurant.banquet")}>
              Open {vertical === "tiffin" ? "tiffin" : vertical === "caterer" ? "catering" : "banquet"}
            </Button>
          </Row>
          <Row title="How you get paid">
            <Button variant="secondary" size="sm" href={`${base}/restaurant/payments`}>Choose card, e-transfer or cash</Button>
          </Row>
          <Row title="HST">
            <TaxStatus owner={owner} compact />
          </Row>
          <Row title="Your share link">
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded-[6px] bg-bg-subtle px-2 py-1 text-caption text-fg">{`${origin}/shops/${slug}${vertical === "tiffin" ? "/tiffin" : vertical === "caterer" ? "/catering" : "/banquet"}`}</code>
              <Button variant="secondary" size="sm" iconStart={copied ? Check : Copy} onClick={() => void navigator.clipboard?.writeText(`${origin}/shops/${slug}${vertical === "tiffin" ? "/tiffin" : vertical === "caterer" ? "/catering" : "/banquet"}`).then(() => setCopied(true)).catch(() => undefined)}>
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </Row>
        </>
      ) : null}
      {family !== "menu" ? (
        <>
          <Row title="Your hours">
            <Button variant="secondary" size="sm" href={`${base}/settings?tab=hours`}>Check your hours</Button>
            <p className="mt-1.5 text-caption text-fg-muted">Customers only see times when you are open.</p>
          </Row>
          <Row title="HST">
            <TaxStatus owner={owner} compact />
          </Row>
          <Row title={family === "catalog" ? "Your ordering link" : "Your booking link"}>
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded-[6px] bg-bg-subtle px-2 py-1 text-caption text-fg">{link}</code>
              <Button variant="secondary" size="sm" iconStart={copied ? Check : Copy} onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => undefined)}>
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </Row>
        </>
      ) : null}
      <Row title="Then your first stamp">
        <Button variant="ghost" size="sm" href={`${base}/setup?step=first_stamp`}>Skip to your first stamp</Button>
      </Row>
    </ul>
  );
}
