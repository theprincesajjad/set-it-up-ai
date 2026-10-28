import { RESTAURANT_PLANS } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { DOORDASH_CANADA } from "@/lib/marketing/sources";
import { DOORDASH_RATE_LINE, appCommission, dollarRange } from "@/lib/marketing/savings";
import { moneyShort } from "@/lib/marketing/text";
import { MSection } from "./Section";

const MONTHLY_CENTS = 500_000;

/** Landing band for the paying wedge: the delivery-app commission on $5,000 of orders against the flat Starter price. */
export function RestaurantBand() {
  const b = copy.landing.restaurantBand;
  const c = appCommission(MONTHLY_CENTS);
  return (
    <MSection tone="ink" id="restaurants">
      <div className="grid gap-10 md:grid-cols-2 md:items-center md:gap-16">
        <div>
          <p className="text-meta-strong text-primary-foreground/60">{b.eyebrow}</p>
          <h2 className="display mt-3 text-mkt-md text-balance md:text-mkt-lg">{b.title}</h2>
          <p className="mt-5 text-[17px] leading-[1.55] text-primary-foreground/65">{b.sub}</p>
          <Button size="lg" variant="inverse" href="/for-restaurants" className="mt-8">
            {b.cta}
          </Button>
        </div>
        <div className="rounded-sheet bg-background p-6 text-foreground md:p-8">
          <p className="text-meta-strong text-muted-foreground">{b.cardTitle}</p>
          <div className="mt-5 border-b border-border pb-5">
            <p className="text-meta text-muted-foreground">{b.appLabel}</p>
            <p className="display mt-1 text-mkt-sm tabular-nums text-muted-foreground">{dollarRange(c.pickupLowCents, c.deliveryMaxCents)}</p>
          </div>
          <div className="mt-5 border-b border-border pb-5">
            <p className="text-meta text-muted-foreground">{b.flatLabel}</p>
            <p className="display mt-1 text-mkt-sm tabular-nums">
              {moneyShort(RESTAURANT_PLANS.starter.priceCents)} {b.perMonth}
            </p>
          </div>
          <p className="mt-4 text-caption text-muted-foreground">
            {DOORDASH_RATE_LINE}{" "}
            <a href={DOORDASH_CANADA.sourceUrl} className="underline decoration-input/60 underline-offset-2">
              merchants.doordash.com/en-ca
            </a>
            . {b.own}
          </p>
        </div>
      </div>
    </MSection>
  );
}
