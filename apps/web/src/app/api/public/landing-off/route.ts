/**
 * "Turn it off" under the landing pages (value-props §3.6): sets `ll_aid=off` for a year, drops the variant cookie and goes back to
 * the page the visitor was on, at the line that confirms it (lib/marketing/landing-off.ts). From then on the page renders control and
 * sends nothing. Only the home page and the three trade pages are allowed as `next`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { AID_OFF, AID_OFF_DAYS, LANDING_COOKIES } from "@ll/shared";
import { landingOffDestination } from "@/lib/marketing/landing-off";

export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL(landingOffDestination(req.nextUrl.searchParams.get("next")), req.nextUrl.origin), 303);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set({ name: LANDING_COOKIES.aid, value: AID_OFF, maxAge: AID_OFF_DAYS * 86_400, path: "/", sameSite: "lax", secure, httpOnly: false });
  res.cookies.set({ name: LANDING_COOKIES.variant, value: "", maxAge: 0, path: "/", sameSite: "lax", secure, httpOnly: false });
  res.headers.set("cache-control", "no-store");
  return res;
}
