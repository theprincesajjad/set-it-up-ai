/**
 * Server clock. Countdowns (redeem codes: RedemptionDto.expiresAt) are computed
 * against the API's time, not the phone's, so a phone with a wrong clock still
 * shows the right minutes left. The offset comes from each response's `Date`
 * header (native; browsers hide it on cross-origin calls), or failing that from
 * the createdAt of something the server just created.
 */
let offsetMs = 0;
let fromHeader = false;

/** Record the server's `Date` response header (1 s resolution). */
export function observeServerDate(header: string | null | undefined, receivedAt = Date.now()): void {
  if (!header) return;
  const t = Date.parse(header);
  if (Number.isNaN(t)) return;
  offsetMs = t - receivedAt;
  fromHeader = true;
}

/** Fallback when no Date header was seen: an ISO timestamp the server stamped moments ago. */
export function observeServerTimestamp(iso: string | null | undefined, receivedAt = Date.now()): void {
  if (fromHeader || !iso) return;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return;
  // Only trust it as a clock reading if it's plausibly "just now" on the server (skews under a day).
  if (Math.abs(t - receivedAt) < 86_400_000) offsetMs = t - receivedAt;
}

export function serverNow(now = Date.now()): number {
  return now + offsetMs;
}

/** Whole seconds until `expiresAt` on the server's clock (0 when past), or null when it never expires. */
export function secondsLeft(expiresAt: string | null | undefined, now = serverNow()): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.ceil((t - now) / 1000));
}

export function resetServerClock(): void {
  offsetMs = 0;
  fromHeader = false;
}
