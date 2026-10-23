/**
 * Public view of an app-created PaymentIntent, for the web pay page the mobile app opens
 * (/pay/intent/<id>?cs=<clientSecret>; the app has no Stripe SDK). The client secret in the query is
 * the only credential: it is checked against the payments provider, and a wrong or missing secret looks
 * exactly like an unknown intent (404). Intents are resolved through the tables that store them.
 */
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { cateringEvents, hallBookings, halls, orders, tiffinCharges, tiffinPlans, tiffinSubscriptions } from "@ll/db";
import type { restaurantApi, tiffinApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { notFound } from "../../lib/errors.js";
import { formatLocalDateTime, loadMerchant } from "../../services/commerceShared.js";
import { getPayments } from "../../providers/payments.js";
import { retrieveConnectPayment, savedMethodScope } from "../../services/payments.js";
import { cardOnFileOf } from "../../services/tiffin.js";

type Resolved = { merchantId: string; kind: restaurantApi.PaymentIntentKind; describe: (merchant: { name: string; timezone: string }) => string };

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  /** Which tiffin charge, hall booking, catering event or order owns this PaymentIntent, and how to describe it. */
  async function resolve(id: string): Promise<Resolved | null> {
    const [charge] = await ctx.db
      .select({ c: tiffinCharges, planName: tiffinPlans.name })
      .from(tiffinCharges)
      .innerJoin(tiffinSubscriptions, eq(tiffinSubscriptions.id, tiffinCharges.subscriptionId))
      .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
      .where(eq(tiffinCharges.stripePaymentIntentId, id))
      .limit(1);
    if (charge) return { merchantId: charge.c.merchantId, kind: "tiffin", describe: () => `Tiffin: ${charge.planName}, ${charge.c.periodStart} to ${charge.c.periodEnd}` };

    const [booking] = await ctx.db
      .select({ b: hallBookings, hallName: halls.name })
      .from(hallBookings)
      .innerJoin(halls, eq(halls.id, hallBookings.hallId))
      .where(eq(hallBookings.depositPaymentIntentId, id))
      .limit(1);
    if (booking) return { merchantId: booking.b.merchantId, kind: "hall_deposit", describe: (m) => `Hall deposit: ${booking.hallName}, ${formatLocalDateTime(booking.b.startsAt, m.timezone)}` };

    const [event] = await ctx.db.select().from(cateringEvents).where(eq(cateringEvents.depositPaymentIntentId, id)).limit(1);
    if (event) return { merchantId: event.merchantId, kind: "catering_deposit", describe: () => `Catering deposit: ${event.eventType.replace(/_/g, " ")} on ${event.eventDate}, quote #${event.number}` };

    const [order] = await ctx.db.select().from(orders).where(eq(orders.stripePaymentIntentId, id)).limit(1);
    if (order) return { merchantId: order.merchantId, kind: "order", describe: () => `Order #${order.number}` };
    return null;
  }

  /** /pay/setup/<setupIntentId>?cs=: the "change card" page for a tiffin subscription. Same rule as above: the client secret is the credential. */
  app.get<{ Params: { setupIntentId: string }; Querystring: { cs?: string } }>("/public/payments/setup/:setupIntentId", async (req): Promise<tiffinApi.SetupIntentView> => {
    const secret = typeof req.query.cs === "string" ? req.query.cs : "";
    const [row] = secret
      ? await ctx.db
          .select({ sub: tiffinSubscriptions, planName: tiffinPlans.name })
          .from(tiffinSubscriptions)
          .innerJoin(tiffinPlans, eq(tiffinPlans.id, tiffinSubscriptions.planId))
          .where(eq(tiffinSubscriptions.setupIntentId, req.params.setupIntentId))
          .limit(1)
      : [];
    const merchant = row && (await loadMerchant(ctx.db, row.sub.merchantId));
    if (!row || !merchant) throw notFound("Payment method");
    const si = await getPayments(ctx).retrieveSetupIntent(req.params.setupIntentId, savedMethodScope(ctx, merchant)).catch(() => null);
    if (!si || !safeEqual(si.clientSecret, secret)) throw notFound("Payment method");
    const status: tiffinApi.SetupIntentView["status"] = si.status === "succeeded" ? "succeeded" : si.status === "processing" ? "processing" : si.status === "canceled" ? "canceled" : "requires_payment";
    return {
      merchant: { name: merchant.name, slug: merchant.slug, logoUrl: merchant.logoUrl, brandColor: merchant.brandColor },
      description: `Tiffin: ${row.planName}`,
      status,
      methods: row.sub.paymentMethod === "pad" ? ["acss_debit"] : ["card"],
      cardOnFile: status === "succeeded" ? cardOnFileOf(row.sub) : null,
    };
  });

  app.get<{ Params: { paymentIntentId: string }; Querystring: { cs?: string } }>("/public/payments/:paymentIntentId", async (req): Promise<restaurantApi.PaymentIntentView> => {
    const secret = typeof req.query.cs === "string" ? req.query.cs : "";
    const found = secret ? await resolve(req.params.paymentIntentId) : null;
    const merchant = found && (await loadMerchant(ctx.db, found.merchantId));
    if (!found || !merchant) throw notFound("Payment");
    const pi = await retrieveConnectPayment(ctx, merchant, req.params.paymentIntentId).catch(() => null);
    if (!pi || !safeEqual(pi.clientSecret, secret)) throw notFound("Payment");
    const status: restaurantApi.PaymentIntentViewStatus = pi.status === "succeeded" ? "succeeded" : pi.status === "processing" ? "processing" : pi.status === "canceled" ? "canceled" : "requires_payment";
    return {
      merchant: { name: merchant.name, slug: merchant.slug, logoUrl: merchant.logoUrl, brandColor: merchant.brandColor },
      description: found.describe(merchant),
      amountCents: pi.amountCents,
      currency: "CAD",
      kind: found.kind,
      status,
    };
  });
}
