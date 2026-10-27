/**
 * Starter price lists for shops that book by the appointment, so a new shop adds its usual services in one tap instead of
 * typing them. Salons and barbers get their own list; a pet groomer's prices go by dog size (the size is in the name, in
 * brackets, and booking shows a dog only the prices for its size). There is no Bridal line outside a salon.
 */
import type { Vertical } from "./verticals.js";

export interface ServiceStarter {
  name: string;
  durationMin: number;
  priceCents: number;
  depositCents?: number;
  bufferMin?: number;
  /** The usual days between visits, for rebooking. */
  rebookAfterDays?: number;
  /** "from" price: it depends on the job. */
  priceFrom?: boolean;
}

export const DOG_SIZES = ["small", "medium", "large", "giant"] as const;
export type DogSize = (typeof DOG_SIZES)[number];

const SIZE_RE = /\((small|medium|large|giant)(?: dog)?\)/i;

/** The size a service is priced for ("Full groom (large dog)" gives "large"), or null when it is for every size. */
export function serviceSize(name: string): DogSize | null {
  const m = SIZE_RE.exec(name);
  return m ? (m[1]!.toLowerCase() as DogSize) : null;
}

/** A service shows for a pet when it carries no size or the pet's size. With no pet picked, everything shows. */
export function serviceFitsSize(name: string, sizeBand: string | null | undefined): boolean {
  const s = serviceSize(name);
  return !s || !sizeBand || s === sizeBand;
}

/** The name without the size marker ("Full groom (large dog)" gives "Full groom"), for a pet that is already known to be large. */
export function serviceBaseName(name: string): string {
  return name.replace(SIZE_RE, "").replace(/\s{2,}/g, " ").trim();
}

const SIZE_STEP: Record<DogSize, { minAdd: number; priceAdd: number }> = {
  small: { minAdd: 0, priceAdd: 0 },
  medium: { minAdd: 15, priceAdd: 1500 },
  large: { minAdd: 30, priceAdd: 3500 },
  giant: { minAdd: 45, priceAdd: 6000 },
};

function bySize(name: string, base: { durationMin: number; priceCents: number; rebookAfterDays?: number }): ServiceStarter[] {
  return DOG_SIZES.map((size) => ({ name: `${name} (${size} dog)`, durationMin: base.durationMin + SIZE_STEP[size].minAdd, priceCents: base.priceCents + SIZE_STEP[size].priceAdd, rebookAfterDays: base.rebookAfterDays }));
}

export const SERVICE_STARTERS: Partial<Record<Vertical, ServiceStarter[]>> = {
  salon: [
    { name: "Haircut", durationMin: 45, priceCents: 5500, rebookAfterDays: 42 },
    { name: "Colour", durationMin: 120, priceCents: 14000, priceFrom: true, depositCents: 4000, rebookAfterDays: 56 },
    { name: "Brow threading", durationMin: 15, priceCents: 1500, rebookAfterDays: 21 },
    { name: "Blow dry", durationMin: 45, priceCents: 4500 },
  ],
  barber: [
    { name: "Cut", durationMin: 30, priceCents: 3500, rebookAfterDays: 21 },
    { name: "Cut and beard", durationMin: 45, priceCents: 5000, rebookAfterDays: 21 },
    { name: "Kids' cut", durationMin: 25, priceCents: 2500, rebookAfterDays: 28 },
    { name: "Beard trim", durationMin: 15, priceCents: 1800, rebookAfterDays: 14 },
  ],
  spa: [
    { name: "Facial", durationMin: 60, priceCents: 9000, rebookAfterDays: 35 },
    { name: "Massage, 60 min", durationMin: 60, priceCents: 10500, rebookAfterDays: 28 },
    { name: "Manicure", durationMin: 45, priceCents: 4500, rebookAfterDays: 21 },
  ],
  pet: [
    ...bySize("Full groom", { durationMin: 90, priceCents: 7500, rebookAfterDays: 42 }),
    ...bySize("Bath and tidy", { durationMin: 60, priceCents: 5500, rebookAfterDays: 28 }),
    { name: "Nail trim", durationMin: 15, priceCents: 2000, rebookAfterDays: 28 },
    { name: "De-shedding add-on", durationMin: 20, priceCents: 2500 },
  ],
};
