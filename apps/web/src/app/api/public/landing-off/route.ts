/**
 * "Turn it off" under the landing pages (value-props §3.6): sets `ll_aid=off` for a year, drops the variant cookie and goes back to
 * the page, which from then on renders control and sends nothing. Only the three landing pages are allowed as `next`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { AID_OFF, AID_OFF_DAYS, LANDING_COOKIES } from "@ll/shared";

const BACK = /^\/for-(nail-techs|barbers|groomers)(\?trade=(brows|lashes|makeup))?$/;

export function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "";
  const res = NextResponse.redirect(new URL(BACK.test(next) ? next : "/for-nail-techs", req.nextUrl.origin), 303);
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set({ name: LANDING_COOKIES.aid, value: AID_OFF, maxAge: AID_OFF_DAYS * 86_400, path: "/", sameSite: "lax", secure, httpOnly: false });
  res.cookies.set({ name: LANDING_COOKIES.variant, value: "", maxAge: 0, path: "/", sameSite: "lax", secure, httpOnly: false });
  res.headers.set("cache-control", "no-store");
  return res;
}
