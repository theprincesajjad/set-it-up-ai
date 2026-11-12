/**
 * Counter text in the staff member's language. Each helper takes the `useLocale()` value first. English keeps the hand-written
 * sentences in ./award.ts exactly (their tests stand); hi / ur / pa build the same sentences from the shared catalog.
 * Errors never show the server's own (English) message: they map by status and code to a translated sentence, in every language.
 * No React Native imports (unit-tested in Node).
 */
import {
  awardButtonLabel,
  carryOverLine,
  cooldownWarning,
  firstName,
  formatNumber,
  matchesHeading,
  ordinal,
  stampsLeft,
  successView,
  type CounterProgram,
  type SuccessView,
} from "./award";
import { formatPtsL, rewardInSentenceL, termWordL, type L } from "./formatL";

type Err = { code?: string; status?: number; message?: string; isNetwork?: boolean } | null | undefined;

/** "5th" in English, a plain number elsewhere (the sentence carries the ordinal word). */
export const nthL = (L: L, n: number): string => (L.locale === "en" ? ordinal(n) : String(n));

export function awardButtonLabelL(L: L, program: CounterProgram, opts: { points: number; noEarn?: boolean; multiplier?: number; newCustomer?: boolean }): string {
  if (L.locale === "en") return awardButtonLabel(program, opts);
  if (opts.newCustomer) return L.t("counter.new.submit");
  if (opts.noEarn) return L.t("mc.recordVisit");
  const m = opts.multiplier;
  const suffix = m && m > 1 ? ` (${L.t("mc.multiplier", { x: Number.isInteger(m) ? String(m) : m.toFixed(1) })})` : "";
  if (program.earnType === "stamps") return `${L.t("counter.add.stamps", { n: Math.max(1, opts.points) })}${suffix}`;
  if (program.earnType === "per_visit") return `${L.t("counter.add.visit", { n: opts.points })}${suffix}`;
  return `${L.t("counter.add.points", { n: opts.points })}${suffix}`;
}

type SuccessInput = Parameters<typeof successView>[0];

export function successViewL(L: L, input: SuccessInput): SuccessView {
  if (L.locale === "en") return successView(input);
  const { program } = input;
  const term = program.terminology;
  const stamps = program.earnType === "stamps";
  const title = stamps ? L.t("counter.added.stamps", { n: input.pointsEarned }) : input.pointsEarned === 0 ? L.t("mc.visitRecorded") : L.t("counter.added.points", { n: input.pointsEarned, unit: term.toLowerCase() === "points" ? L.t("counter.unit.short") : term });
  const tilde = input.offline ? "~" : "";
  let hero: string;
  if (input.balance === null) hero = `+${formatNumber(input.pointsEarned)}`;
  else if (stamps && program.stampGoal > 0 && input.balance <= program.stampGoal) hero = `${tilde}${formatNumber(input.balance)} / ${formatNumber(program.stampGoal)}`;
  else hero = `${tilde}${formatPtsL(L, input.balance, term)}`;
  const ready = input.rewardsAvailable?.[0];
  let next: string | null = null;
  if (input.offline && input.balance === null) next = null;
  else if (ready) next = L.t("mc.rewardReadyName", { reward: ready.name });
  else if (input.nextReward) next = stamps ? L.t("counter.moreFor", { n: input.nextReward.pointsNeeded, reward: input.nextReward.name }) : L.t("counter.toReward", { n: formatPtsL(L, input.nextReward.pointsNeeded, term), reward: input.nextReward.name });
  const balanceLine = input.balance === null ? "" : input.firstName ? L.t("counter.toast.now", { name: input.firstName, balance: formatPtsL(L, input.balance, term) }) : L.t("counter.toast.balance", { balance: formatPtsL(L, input.balance, term) });
  const announcement = [title, balanceLine, next ?? ""].filter(Boolean).join(". ");
  const count = input.balance === null ? { from: 0, to: input.pointsEarned } : { from: Math.max(0, input.balance - input.pointsEarned), to: input.balance };
  return { title, hero, next, rewardReady: !!ready, offline: !!input.offline, messages: input.messages ?? [], announcement, count, name: input.fullName ?? null, visitsThisMonth: input.visitsThisMonth ?? null, balance: input.balance };
}

export function cooldownWarningL(L: L, member: { name: string | null; lastVisitAt: string | null }, program: CounterProgram, nowMs: number): string | null {
  if (L.locale === "en") return cooldownWarning(member, program, nowMs);
  if (!member.lastVisitAt) return null;
  const ago = nowMs - new Date(member.lastVisitAt).getTime();
  if (ago < 0 || ago >= 2 * 60_000) return null;
  const mins = Math.max(1, Math.round(ago / 60_000));
  return L.t("mc.cooldown", { who: firstName(member.name) ?? L.t("mc.fallbackWho"), what: L.t(program.earnType === "stamps" ? "mc.cooldown.stamp" : "mc.cooldown.earned"), mins });
}

export const visitThisMonthL = (L: L, n: number): string => L.t("counter.visitMonth", { nth: nthL(L, Math.max(1, n)) });
export const visitNthL = (L: L, n: number): string => L.t("counter.visitNth", { nth: nthL(L, n) });

export function stampsLeftL(L: L, left: number, rewardName: string): string {
  if (L.locale === "en") return stampsLeft(left, rewardName);
  return left <= 0 ? L.t("counter.readyShort", { reward: rewardName }) : L.t("counter.moreFor", { n: left, reward: rewardName });
}

export function matchesHeadingL(L: L, n: number, digits: string): string {
  if (n === 1) return L.t("counter.pick.one", { digits });
  if (L.locale === "en") return matchesHeading(n, digits);
  return L.t("counter.pick.many", { count: n, digits });
}

export function cameInTextL(L: L, iso: string | null | undefined, now: Date): string {
  if (!iso) return L.t("counter.came.new");
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return L.t("counter.came.today");
  if (days === 1) return L.t("counter.came.yesterday");
  if (days < 14) return L.t("counter.came.days", { n: days });
  if (days < 60) return L.t("counter.came.weeks", { n: Math.round(days / 7) });
  return L.t("counter.came.months", { n: Math.round(days / 30) });
}

export function carryOverLineL(L: L, name: string | null, balance: number, rewardCost: number, terminology: string): string {
  if (L.locale === "en") return carryOverLine(name, balance, rewardCost, terminology);
  const first = firstName(name);
  const bal = formatPtsL(L, balance, terminology);
  const has = first ? L.t("counter.has", { name: first, balance: bal }) : L.t("counter.theyHave", { balance: bal });
  const carry = balance - rewardCost;
  return `${has} ${carry > 0 ? L.t("counter.carry", { n: carry }) : L.t("counter.freshCard")}`;
}

/** A reward name inside a sentence ("a free drink" in English; unchanged elsewhere). */
export const rewardInL = rewardInSentenceL;

/** Number-of-units word inside a sentence (the shop's own word stays as typed). */
export const unitWordL = termWordL;

/**
 * A failed counter call in plain words: what happened and what to do. `ctx.last4` fills the duplicate message; the server's own
 * message is never shown, only a translated sentence chosen by code, then by status.
 */
export function counterErrorL(L: L, e: Err, ctx: { terminology?: string | null; firstName?: string | null; last4?: string | null } = {}): string {
  const word = termWordL(L, ctx.terminology);
  const who = ctx.firstName || L.t("counter.who");
  if (!e) return L.t("counter.err.generic");
  if (e.isNetwork || e.status === 0) return L.t("counter.err.offlineSaved");
  switch (e.code) {
    case "cooldown":
      return L.t("counter.err.cooldown", { who, word });
    case "daily_limit":
      return L.t("counter.err.dailyLimit", { who, word });
    case "insufficient_points":
      return L.t("counter.err.insufficient", { word });
    case "expired":
    case "code_expired":
      return L.t("counter.err.expired");
    case "already_used":
      return L.t("counter.err.used");
    case "void":
      return L.t("counter.err.void");
    case "not_found":
      return L.t("counter.err.notFound");
    case "program_paused":
      return L.t("counter.err.paused");
    case "duplicate":
      return L.t("mc.q.dup", { who: ctx.last4 ? `•• ${ctx.last4}` : who });
    case "conflict":
      return /pause/i.test(e.message ?? "") ? L.t("counter.err.paused") : L.t("err.conflict.line");
    case "forbidden":
      return L.t("mc.award.noEarn");
  }
  if (e.status === 404) return L.t("counter.err.notFound");
  if (e.status === 401) return L.t("err.session.counter");
  if (e.status === 403) return L.t("err.forbidden.line");
  if (e.status === 409) return L.t("err.conflict.line");
  if (e.status === 429) return L.t("err.rate.lineNoWait");
  if (e.status === 400 || e.status === 422) return L.t("err.validation.line");
  if (e.status && e.status >= 500) return L.t("counter.err.server");
  return L.t("counter.err.generic");
}
