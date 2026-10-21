/**
 * BFF: same-origin proxy from the browser to the API. `/api/ll/v1/me` →
 * `${API}/v1/me` with the httpOnly bearer cookie attached and refresh-token
 * rotation on 401. Sign-in endpoints are blocked here (use /api/auth/*).
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { forwardToApi, isBlockedBffPath } from "@/lib/auth/handlers";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const apiPath = `/${path.map(encodeURIComponent).join("/")}`;
  if (!apiPath.startsWith("/v1/") || isBlockedBffPath(apiPath)) {
    return NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  }
  const jar = await cookies();
  const r = await forwardToApi(req, apiPath, jar);
  const res = new NextResponse(r.body, { status: r.status, headers: r.headers });
  for (const c of r.cookies) res.cookies.set(c);
  return res;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
