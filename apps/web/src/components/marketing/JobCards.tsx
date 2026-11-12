import { RESTAURANT_PLANS, RESTAURANT_TIERS } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { restaurantCopy, type RestaurantSections } from "@/copy/restaurants-locales";
import { fill } from "@/lib/marketing/text";
import { MHeading, MSection } from "./Section";

/** "300 to 3,000": the WhatsApp messages each tier includes, from RESTAURANT_PLANS (`template` is the page language's "{min} to {max}"). */
export function whatsappRange(template: string = copy.restaurants.rangeTo): string {
  const n = RESTAURANT_TIERS.map((t) => RESTAURANT_PLANS[t].whatsappPerMonth);
  return fill(template, { min: Math.min(...n).toLocaleString("en-CA"), max: Math.max(...n).toLocaleString("en-CA") });
}

/** Four jobs, one card each, each with a three-row product view, in the page's language (`c`). The rows are examples; the page says so. */
export function JobCards({ c = restaurantCopy("en") }: { c?: RestaurantSections } = {}) {
  const r = c;
  return (
    <MSection id="jobs" reveal>
      <MHeading eyebrow={r.jobsEyebrow} title={r.jobsTitle} />
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        {r.jobs.map((j, n) => (
          <article key={j.key} data-trade="restaurant" className="mkt-lift flex flex-col rounded-sheet bg-card p-6 shadow-card md:p-8">
            <p className={`w-fit rounded-full px-3 py-1 text-meta-strong ${["bg-tile-peach text-tile-peach-foreground", "bg-tile-mint text-tile-mint-foreground", "bg-tile-butter text-tile-butter-foreground", "bg-tile-lilac text-tile-lilac-foreground"][n % 4]}`}>{j.eyebrow}</p>
            <h3 className="display mt-3 text-title text-balance md:text-[28px] md:leading-8">{j.title}</h3>
            <p className="mt-3 text-body text-muted-foreground">{fill(j.body, { range: whatsappRange(r.rangeTo) })}</p>
            <ul aria-label={fill(r.jobExample, { job: j.eyebrow })} className="mt-5 divide-y divide-border rounded-card bg-bg-subtle px-4 text-meta text-foreground">
              {j.rows.map((row) => (
                <li key={row} className="py-2.5">
                  {row}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="mt-4 text-caption text-muted-foreground">{r.jobsNote}</p>
    </MSection>
  );
}
