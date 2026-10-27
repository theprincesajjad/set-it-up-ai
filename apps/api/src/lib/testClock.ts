/**
 * Promo test clock. Demo promos run on weekdays and hours (Pinecone: "Two-stamp Tuesdays", weekdays 2 to 4 pm), so what
 * one stamp earns depends on the day the suite happens to run. Setting
 *
 *   TEST_PROMO_NOW=2026-01-07T16:00:00Z      (any ISO instant)
 *
 * makes the weekday and time-of-day checks of promos (`promoAppliesAt`, which also drives `activeNow` and the earn
 * boost) read that instant in the shop's timezone. Only that check: every other clock, the promo's own start/end dates,
 * seeds, tokens and the web app stay on real time, so nothing else can disagree about what "now" is.
 *
 * Ignored when NODE_ENV=production. The e2e runner (apps/web/e2e/run-all.sh) sets it to a Wednesday at 11:00 Toronto.
 */
export function promoClockAt(real: Date, env: NodeJS.ProcessEnv = process.env): Date {
  if (env.NODE_ENV === "production") return real;
  const raw = env.TEST_PROMO_NOW;
  if (!raw) return real;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? real : t;
}
