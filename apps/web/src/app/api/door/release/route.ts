import { NextResponse } from "next/server";

/**
 * POST /api/door/release: the door tablet calls this right after a staff PIN has been accepted, so the tablet may leave the door
 * (see the ll_door cookie in proxy.ts). It only clears a cookie on the caller's own browser.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: "ll_door", value: "", path: "/", maxAge: 0, sameSite: "lax", httpOnly: true });
  return res;
}
