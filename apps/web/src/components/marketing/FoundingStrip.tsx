import { FOUNDING_OFFER, type networkApi } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { restaurantCopy, type RestaurantSections } from "@/copy/restaurants-locales";
import { publicServerApi } from "@/lib/api/server";
import { fill } from "@/lib/marketing/text";

export const spotsLeft = (c: Pick<networkApi.FoundingCorridorDto, "taken" | "total">) => Math.max(0, c.total - c.taken);

/** Corridors that still have a spot, most open first (ties by name). */
export function openCorridors(corridors: networkApi.FoundingCorridorDto[]): networkApi.FoundingCorridorDto[] {
  return corridors.filter((c) => spotsLeft(c) > 0).sort((a, b) => spotsLeft(b) - spotsLeft(a) || a.name.localeCompare(b.name));
}

/** Founding spots from GET /v1/public/restaurants/corridors, or null when the API fails or no corridor has a spot. */
export async function loadFounding(): Promise<networkApi.FoundingCorridorDto[] | null> {
  try {
    const open = openCorridors((await publicServerApi().public.foundingRestaurants()).corridors);
    return open.length ? open : null;
  } catch {
    return null;
  }
}

/** "14 of 20 first-year offer spots left on Ridgeway Plaza", or the same line in the page's language (`template`). */
export const foundingHeadline = (c: networkApi.FoundingCorridorDto, template: string = copy.restaurants.founding.headline) => fill(template, { left: spotsLeft(c), total: c.total, street: c.name });

/** One sentence for the pricing page: the live count, or an invitation to ask when the API is down. */
export async function FoundingLine() {
  const open = await loadFounding();
  if (!open) return <>Ask us if your corridor still has a spot.</>;
  return <>{open.slice(0, 3).map((c) => `${spotsLeft(c)} of ${c.total} spots left on ${c.name}`).join("; ")}.</>;
}

/** The founding strip under the restaurants hero, in the page's language (`c`). Hidden when the API fails: no number is better than a made-up one. */
export async function FoundingStrip({ c = restaurantCopy("en") }: { c?: RestaurantSections } = {}) {
  const F = c.founding;
  const open = await loadFounding();
  if (!open) return null;
  const [first, ...rest] = open;
  return (
    <section aria-label={F.label} className="mkt-band-butter">
      <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-10 md:grid-cols-[1fr_1fr] md:items-center md:gap-14 md:px-8 md:py-12">
        <div>
          <h2 data-testid="founding-headline" className="display text-mkt-sm text-balance md:text-mkt-md">
            {foundingHeadline(first!, F.headline)}
          </h2>
          {rest.length ? <p className="mt-2 text-meta text-muted-foreground">{fill(F.also, { list: rest.slice(0, 3).map((x) => fill(F.alsoItem, { street: x.name, left: spotsLeft(x) })).join(", ") })}</p> : null}
        </div>
        <p className="text-body text-muted-foreground">{fill(F.sub, { slots: FOUNDING_OFFER.slotsPerCorridor, first: FOUNDING_OFFER.firstYearPct, life: FOUNDING_OFFER.lifetimePct })}</p>
      </div>
    </section>
  );
}
