/**
 * People side (phase solo, workstream D): the inbox, the client profile extras and the appointment-led client list (shop side), and
 * the customer's own threads, web push and channel preference (/v1/me/*). Contract: @ll/shared inboxApi; docs/engineering/api/inbox.md.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { appointmentsApi, inboxApi, messagingApi, normalizeLocale } from "@ll/shared";
import { and, eq } from "drizzle-orm";
import { appointments, services } from "@ll/db";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser } from "../../lib/auth.js";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { assertNotOwnClientsOnly, isOwnClientsOnly } from "../../services/barber.js";
import { requireFeature } from "../../services/features.js";
import * as inbox from "../../services/inbox.js";
import * as people from "../../services/merchant-customers.js";
import { listPromoTemplates, lastPromoResult, sendPromo } from "../../services/messaging.js";
import { subscribeWebPush, unsubscribeWebPush, webPushPublicKey, webPushStatus } from "../../services/web-push.js";
import { rejectMalformedIds } from "../merchant/params.js";

type Req<P = object> = FastifyRequest<{ Params: { merchantId: string } & P }>;

export default async function register(parent: FastifyInstance, ctx: AppContext): Promise<void> {
  await parent.register(async (app) => {
    rejectMalformedIds(app);
    await routes(app, ctx);
  });
}

async function routes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  // ---- Inbox (staff+, not a renter who sees only their own clients) ----
  app.get("/merchants/:merchantId/inbox", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await assertNotOwnClientsOnly(ctx, s);
    return inbox.listInbox(ctx, s.merchant, parse(inboxApi.listInboxQuery, req.query));
  });

  app.post("/merchants/:merchantId/inbox", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    const { memberId } = parse(inboxApi.startConversationBody, req.body);
    return inbox.startConversation(ctx, s.merchant, memberId);
  });

  app.get("/merchants/:merchantId/inbox/:conversationId", async (req: Req<{ conversationId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await assertNotOwnClientsOnly(ctx, s);
    return inbox.getThread(ctx, s.merchant, req.params.conversationId);
  });

  app.post("/merchants/:merchantId/inbox/:conversationId/messages", async (req: Req<{ conversationId: string }>, reply) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    const r = await inbox.sendShopMessage(ctx, s, req.params.conversationId, parse(inboxApi.sendInboxMessageBody, req.body));
    reply.status(201);
    return r;
  });

  app.get("/merchants/:merchantId/inbox/:conversationId/booking-prefill", async (req: Req<{ conversationId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return inbox.bookingPrefill(ctx, s.merchant, req.params.conversationId);
  });

  // ---- Client profile extras and the appointment-led list ----
  app.get("/merchants/:merchantId/customers/:memberId/people", async (req: Req<{ memberId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await assertNotOwnClientsOnly(ctx, s);
    return people.getClientProfile(ctx, s.merchant, req.params.memberId);
  });

  app.patch("/merchants/:merchantId/customers/:memberId/preferences", async (req: Req<{ memberId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await assertNotOwnClientsOnly(ctx, s);
    return people.updateClientPreferences(ctx, s.merchant.id, s.user.id, req.params.memberId, parse(inboxApi.updateClientPreferencesBody, req.body));
  });

  app.get("/merchants/:merchantId/clients", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    await requireFeature(ctx.db, s.merchant, "booking.appointments");
    // A chair renter who keeps their clients private sees their own, always.
    const forced = (await isOwnClientsOnly(ctx, s)) ? s.user.id : null;
    return people.listClients(ctx, s.merchant.id, parse(inboxApi.listClientsQuery, req.query), forced);
  });

  // ---- Visit note (checkout) and intake questions ----
  app.put("/merchants/:merchantId/appointments/:appointmentId/visit-note", async (req: Req<{ appointmentId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    const body = parse(appointmentsApi.visitNoteBody, req.body);
    const [row] = await ctx.db
      .update(appointments)
      .set({ visitNote: body.visitNote, ...(body.visitPhotoUrl !== undefined ? { visitPhotoUrl: body.visitPhotoUrl } : {}), updatedAt: ctx.now() })
      .where(and(eq(appointments.id, req.params.appointmentId), eq(appointments.merchantId, s.merchant.id)))
      .returning({ id: appointments.id, visitNote: appointments.visitNote, visitPhotoUrl: appointments.visitPhotoUrl });
    if (!row) throw notFound("Appointment");
    return row;
  });

  app.get("/merchants/:merchantId/intake-questions", async (req: Req): Promise<appointmentsApi.IntakeQuestionsResponse> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    const rows = await ctx.db.select({ id: services.id, name: services.name, q: services.intakeQuestion }).from(services).where(and(eq(services.merchantId, s.merchant.id), eq(services.kind, "appointment"), eq(services.active, true))).orderBy(services.sort, services.name);
    return { items: rows.map((r) => ({ serviceId: r.id, name: r.name, question: r.q })) };
  });

  app.put("/merchants/:merchantId/services/:serviceId/intake-question", async (req: Req<{ serviceId: string }>) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const { question } = parse(appointmentsApi.intakeQuestionBody, req.body);
    const [row] = await ctx.db.update(services).set({ intakeQuestion: question || null, updatedAt: ctx.now() }).where(and(eq(services.id, req.params.serviceId), eq(services.merchantId, s.merchant.id))).returning({ id: services.id, question: services.intakeQuestion });
    if (!row) throw notFound("Service");
    return row;
  });

  // ---- Promos to regulars (manager+) ----
  app.get("/merchants/:merchantId/promo-templates", async (req: Req): Promise<messagingApi.PromoTemplatesResponse> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const lang = normalizeLocale(String((req.query as { lang?: string }).lang ?? "")) ?? "en";
    return listPromoTemplates(ctx, s.merchant, lang);
  });

  app.post("/merchants/:merchantId/promo-sends", async (req: Req, reply): Promise<messagingApi.SendPromoResponse> => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "manager");
    const r = await sendPromo(ctx, s.merchant, s.user.id, parse(messagingApi.sendPromoBody, req.body));
    reply.status(201);
    return r;
  });

  app.get("/merchants/:merchantId/promo-sends/last", async (req: Req) => {
    const s = await requireStaff(ctx, req, req.params.merchantId, "staff");
    return { result: await lastPromoResult(ctx, s.merchant.id) };
  });

  // ---- The customer ----
  app.get("/me/inbox", async (req) => inbox.listMyThreads(ctx, requireUser(req).id));
  app.get("/me/inbox/:conversationId", async (req: FastifyRequest<{ Params: { conversationId: string } }>) => inbox.getMyThread(ctx, requireUser(req).id, req.params.conversationId));
  app.post("/me/inbox/:conversationId/messages", async (req: FastifyRequest<{ Params: { conversationId: string } }>, reply) => {
    const r = await inbox.replyMine(ctx, requireUser(req).id, req.params.conversationId, parse(inboxApi.sendInboxMessageBody, req.body));
    reply.status(201);
    return r;
  });

  app.get("/public/web-push/key", async () => webPushPublicKey(ctx));
  app.get("/me/web-push", async (req) => webPushStatus(ctx, requireUser(req).id));
  app.post("/me/web-push", async (req) => {
    const u = requireUser(req);
    return subscribeWebPush(ctx, u.id, parse(inboxApi.webPushSubscribeBody, req.body));
  });
  app.delete("/me/web-push", async (req) => {
    const u = requireUser(req);
    return unsubscribeWebPush(ctx, u.id, parse(inboxApi.webPushUnsubscribeBody, req.body).endpoint);
  });

  app.get("/me/channel-pref", async (req) => people.getMyChannelPref(ctx, requireUser(req).id));
  app.put("/me/channel-pref", async (req) => people.setMyChannelPref(ctx, requireUser(req).id, parse(inboxApi.myChannelPrefBody, req.body).channelPref));
}
