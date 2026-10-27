/**
 * Test clock: shifts the process clock by a fixed number of milliseconds so date-dependent demo data (weekday promos,
 * festival windows, class schedules) is the same on every day of the week. The clock keeps ticking; only the origin moves.
 *
 *   TEST_CLOCK_OFFSET_MS=<signed ms>   added to every `new Date()` / `Date.now()` in this process
 *
 * Never active when NODE_ENV=production. Import this module first in an entry point (server.ts, seed.ts) so every
 * later module sees the shifted Date. Database-side `now()` defaults are not shifted (they stay within a few days of it).
 */
const RealDate = Date;

export function installTestClock(env: NodeJS.ProcessEnv = process.env): number {
  if (env.NODE_ENV === "production") return 0;
  const raw = env.TEST_CLOCK_OFFSET_MS;
  if (!raw) return 0;
  const offset = Number(raw);
  if (!Number.isFinite(offset) || offset === 0) return 0;
  if (Date !== RealDate) return offset; // already installed
  class ShiftedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...(args as [number]));
    }
    static override now(): number {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = ShiftedDate as unknown as DateConstructor;
  return offset;
}

installTestClock();
