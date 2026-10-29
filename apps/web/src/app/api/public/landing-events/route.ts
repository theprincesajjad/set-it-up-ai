/**
 * Same-origin relay for the landing pages' beacon (components/marketing/landing-ab/beacon-script.ts) to the API's
 * POST /v1/public/landing-events. No session cookie is sent. The API rate-limits by the client address (forwarded here) and
 * stores neither the address nor the user agent (it keeps phone | desktop only).
 */
import { EXPERIMENTS_CLOCK_HEADER, experimentsApi } from "@ll/shared";
import { serverApiUrl } from "@/lib/env";

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > experimentsApi.BEACON_MAX_BYTES) return new Response(null, { status: 413 });
  const headers = new Headers({ "content-type": "application/json" });
  for (const h of ["user-agent", "x-forwarded-for", EXPERIMENTS_CLOCK_HEADER]) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  try {
    const res = await fetch(`${serverApiUrl()}/v1/public/landing-events`, { method: "POST", headers, body, cache: "no-store", signal: AbortSignal.timeout(3000) });
    return new Response(null, { status: res.status === 204 ? 204 : res.status, headers: { "cache-control": "no-store" } });
  } catch {
    // Counting is best effort; the page never waits on it.
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }
}
