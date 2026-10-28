/**
 * Shared response serializers. Every route that shows a balance, reward,
 * promo, location or user should go through these so the web and mobile apps
 * see one consistent shape (types live in @ll/shared api/*). Other route
 * areas are welcome to import from here.
 */
import type { authApi, customerApi, networkApi } from "@ll/shared";
import { maskPhone, themeStyleOf } from "@ll/shared";
import type {
  discountCards,
  ledgerTransactions,
  locations,
  loyaltyPrograms,
  merchantMembers,
  merchants,
  promos,
  rewards,
  users,
  vipLevels,
} from "@ll/db";
import { localParts, promoAppliesAt } from "./ledger.js";

type User = typeof users.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
type Program = typeof loyaltyPrograms.$inferSelect;
type Reward = typeof rewards.$inferSelect;
type DiscountCard = typeof discountCards.$inferSelect;
type VipLevel = typeof vipLevels.$inferSelect;
type Member = typeof merchantMembers.$inferSelect;
type LedgerTx = typeof ledgerTransactions.$inferSelect;
type Location = typeof locations.$inferSelect;
type Promo = typeof promos.$inferSelect;

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function maskedPhone(phone: string | null | undefined): string | null {
  return phone ? maskPhone(phone) : null;
}

export function terminologyOf(program: Pick<Program, "terminology"> | null | undefined): string {
  return program?.terminology ?? "points";
}

/** Rule 6: disclosed wherever a balance is shown. */
export function expiryDisclosure(program: Pick<Program, "expiryMonths" | "terminology"> | null | undefined): string {
  const term = terminologyOf(program);
  const Term = term.charAt(0).toUpperCase() + term.slice(1);
  if (!program?.expiryMonths) return `${Term} never expire.`;
  return `${Term} expire after ${program.expiryMonths} months with no visits.`;
}

/**
 * `paid`: the shop's enabled paid extras. Birthday / referral bonuses show as 0
 * when the shop doesn't have the feature (the bonus isn't awarded then either).
 * Omit only where no paid extras are involved.
 */
export function programSummary(
  program: Program | null | undefined,
  paid: { birthdayBonus: boolean; referrals: boolean } = { birthdayBonus: false, referrals: false },
): customerApi.ProgramSummaryDto | null {
  if (!program || !program.active) return null;
  return {
    name: program.name,
    earnType: program.earnType,
    terminology: program.terminology,
    pointsPerDollar: program.pointsPerDollar,
    pointsPerVisit: program.pointsPerVisit,
    minSpendCents: program.minSpendCents,
    stampGoal: program.stampGoal,
    welcomeBonus: program.welcomeBonus,
    birthdayBonus: paid.birthdayBonus ? program.birthdayBonus : 0,
    referralBonus: paid.referrals ? program.referralBonus : 0,
    expiryMonths: program.expiryMonths ?? null,
    expiryDisclosure: expiryDisclosure(program),
    termsText: program.termsText ?? null,
  };
}

export function rewardDto(r: Reward): customerApi.RewardDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    pointsCost: r.pointsCost,
    rewardType: r.rewardType,
    value: r.value,
    maxDiscountCents: r.maxDiscountCents ?? null,
    imageUrl: r.imageUrl ?? null,
  };
}

const byCost = (a: Pick<Reward, "pointsCost">, b: Pick<Reward, "pointsCost">) => a.pointsCost - b.pointsCost;

export function memberRewards(rs: Reward[], balance: number): customerApi.MemberRewardDto[] {
  return [...rs].sort(byCost).map((r) => ({ ...rewardDto(r), affordable: balance >= r.pointsCost, pointsNeeded: Math.max(0, r.pointsCost - balance) }));
}

export function affordable(rs: Pick<Reward, "id" | "name" | "pointsCost">[], balance: number) {
  return [...rs].filter((r) => r.pointsCost <= balance).sort(byCost).map((r) => ({ id: r.id, name: r.name, pointsCost: r.pointsCost }));
}

/** Cheapest reward the member can't afford yet. */
export function nextReward(rs: Pick<Reward, "id" | "name" | "pointsCost">[], balance: number): customerApi.NextRewardDto | null {
  const next = [...rs].sort(byCost).find((r) => r.pointsCost > balance);
  if (!next) return null;
  return {
    rewardId: next.id,
    name: next.name,
    pointsCost: next.pointsCost,
    pointsNeeded: next.pointsCost - balance,
    progressPct: next.pointsCost > 0 ? Math.max(0, Math.min(100, Math.floor((Math.max(0, balance) / next.pointsCost) * 100))) : 100,
  };
}

export function discountCardDto(c: DiscountCard): customerApi.DiscountCardDto {
  return { id: c.id, name: c.name, percentOff: c.percentOff, amountOffCents: c.amountOffCents, terms: c.terms ?? null, eligibility: c.eligibility };
}

/** Cards a member can use: everyone/members_only/seniors/students always; vip only with a VIP level. */
export function cardsForMember(cards: DiscountCard[], member: Pick<Member, "vipLevelId"> | null): customerApi.DiscountCardDto[] {
  return cards.filter((c) => c.active && (c.eligibility !== "vip" || !!member?.vipLevelId)).map(discountCardDto);
}

export function vipDto(l: VipLevel | null | undefined): customerApi.VipLevelDto | null {
  return l ? { id: l.id, name: l.name, multiplierPct: l.multiplierPct, perks: l.perks ?? null } : null;
}

export function merchantBrief(m: Pick<Merchant, "id" | "slug" | "name" | "vertical" | "logoUrl" | "brandColor" | "neighbourhoodId"> & Partial<Pick<Merchant, "themeStyle">>): customerApi.MerchantBriefDto {
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    vertical: m.vertical,
    logoUrl: m.logoUrl ?? null,
    brandColor: m.brandColor ?? null,
    neighbourhoodId: m.neighbourhoodId ?? null,
    ...(m.themeStyle ? { themeStyle: themeStyleOf(m.themeStyle) } : {}),
  };
}

export function consentDto(m: Pick<Member, "marketingConsentAt" | "marketingConsentText" | "marketingConsentSource">): customerApi.ConsentDto {
  return {
    granted: !!m.marketingConsentAt,
    grantedAt: iso(m.marketingConsentAt),
    text: m.marketingConsentText ?? null,
    source: m.marketingConsentSource ?? null,
  };
}

export function authUserDto(u: User): authApi.AuthUserDto {
  return {
    id: u.id,
    name: u.name ?? null,
    email: u.email ?? null,
    phone: u.phone ?? null,
    platformRole: u.platformRole,
    memberCode: u.memberCode,
    phoneVerified: !!u.phoneVerifiedAt,
    emailVerified: !!u.emailVerifiedAt,
    birthday: u.birthday ?? null,
    postalCode: u.postalCode ?? null,
    homeNeighbourhoodId: u.homeNeighbourhoodId ?? null,
    locale: u.locale,
    createdAt: u.createdAt.toISOString(),
  };
}

export function ledgerTxDto(t: LedgerTx): customerApi.LedgerTxDto {
  return {
    id: t.id,
    type: t.type,
    source: t.source,
    points: t.points,
    description: t.description ?? null,
    amountCents: t.amountCents ?? null,
    breakdown: t.breakdown ?? [],
    locationId: t.locationId ?? null,
    reversed: !!t.reversedAt,
    createdAt: t.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hours, locations, promos
// ---------------------------------------------------------------------------
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Is a location open at `at` (merchant-local)? Supports multiple intervals per
 * day and overnight intervals (["22:00","02:00"] spills into the next day).
 * Returns null when no hours are configured.
 */
export function isOpenNow(hours: Record<string, [string, string][]> | null | undefined, timeZone: string, at: Date): boolean | null {
  if (!hours || Object.keys(hours).length === 0) return null;
  const { dow, hhmm } = localParts(at, timeZone);
  const today = hours[DAY_KEYS[dow]!] ?? [];
  for (const [open, close] of today) {
    if (close > open ? hhmm >= open && hhmm < close : hhmm >= open) return true;
  }
  const yesterday = hours[DAY_KEYS[(dow + 6) % 7]!] ?? [];
  for (const [open, close] of yesterday) {
    if (close <= open && hhmm < close) return true;
  }
  return false;
}

export function locationDto(l: Location, timeZone: string, at: Date): networkApi.LocationDto {
  return {
    id: l.id,
    name: l.name,
    address: l.address,
    city: l.city,
    postalCode: l.postalCode ?? null,
    lat: l.lat ?? null,
    lng: l.lng ?? null,
    phone: l.phone ?? null,
    hours: l.hours ?? null,
    openNow: isOpenNow(l.hours, timeZone, at),
  };
}

export function promoDto(p: Promo, timeZone: string, at: Date): networkApi.PromoDto {
  return {
    id: p.id,
    title: p.title,
    body: p.body ?? null,
    imageUrl: p.imageUrl ?? null,
    kind: p.kind,
    multiplierPct: p.multiplierPct ?? null,
    bonusPoints: p.bonusPoints ?? null,
    percentOff: p.percentOff ?? null,
    daysOfWeek: p.daysOfWeek ?? null,
    startTime: p.startTime ?? null,
    endTime: p.endTime ?? null,
    startsAt: p.startsAt.toISOString(),
    endsAt: iso(p.endsAt),
    audience: (p.audience as networkApi.PromoDto["audience"]) ?? "network",
    activeNow: promoAppliesAt(p, at, timeZone),
  };
}

/** First name only, for customer-facing screens (kiosk). */
export function firstName(name: string | null | undefined): string | null {
  const n = name?.trim().split(/\s+/)[0];
  return n ? n : null;
}
