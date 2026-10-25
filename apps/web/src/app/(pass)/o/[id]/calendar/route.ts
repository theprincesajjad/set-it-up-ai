import { NextResponse } from "next/server";
import { isApiError } from "@/lib/api/errors";
import { getServerApi } from "@/lib/api/server";
import { getMe } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { buildIcs } from "@/lib/restaurant/ics";
import { pickupCode } from "@/lib/restaurant/order";

export const dynamic = "force-dynamic";

/** GET /o/<orderId>/calendar: the pickup as an .ics file ("Add to calendar" on the reservation page). Signed-in customer's own order only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) return new NextResponse("Sign in to add this to your calendar.", { status: 401 });
  const order = await (await getServerApi()).me.order(id).catch((e: unknown) => (isApiError(e) && e.status === 404 ? null : undefined));
  if (order === null) return new NextResponse("Not found", { status: 404 });
  if (order === undefined || !order.pickupAt) return new NextResponse("Not available", { status: 404 });
  const t = await getT();
  const ics = buildIcs({
    uid: order.id,
    start: new Date(order.pickupAt),
    durationMin: 60,
    summary: t("wp.cal.pickupAt", { shop: order.merchantName }),
    location: order.shopAddress ?? order.merchantName,
    description: [t("wp.cal.pickupCode", { code: pickupCode(order.merchantName, order.number) }), ...order.items.map((i) => `${i.quantity} x ${i.name}`), order.balanceDueCents > 0 ? t("wp.cal.payAtPickup", { amount: `$${(order.balanceDueCents / 100).toFixed(2)}` }) : null].filter(Boolean).join("\n"),
  });
  return new NextResponse(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="pickup-${order.number}.ics"`, "cache-control": "private, no-store" } });
}
