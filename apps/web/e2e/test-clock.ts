/**
 * Same shifted clock the API runs on (run-all.sh exports TEST_CLOCK_OFFSET_MS to both), so specs that compute
 * "10 days from now" or "20 minutes from now" agree with the server. Imported by playwright.config.ts, which every
 * worker loads. No-op when the variable is unset. The browser keeps real time; only Node-side spec code is shifted.
 */
const RealDate = Date;
const offset = Number(process.env.TEST_CLOCK_OFFSET_MS ?? 0);

if (Number.isFinite(offset) && offset !== 0 && Date === RealDate) {
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
}

export {};
