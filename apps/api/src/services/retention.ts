/**
 * Retention: deletes or de-identifies personal information once the period in the privacy policy has passed.
 * The periods are set once in @ll/shared (retention.ts) and printed in docs/legal/privacy-policy.md through
 * {{retention.*}} tokens, so this file and the policy cannot disagree. Each rule is one function so a test can
 * run it alone; `runRetention` runs them all (jobs/retention.ts calls it daily). Every rule is idempotent: it
 * only touches rows that still hold something, so running it twice, or after a crash, is safe.
 *
 * What stays: the orders, invoices, charges, deposits and payment records themselves (amounts, dates, status).
 * Only the free text and files around them go.
 */
import { and, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import {
  appointments,
  auditLogs,
  hallBookings,
  invoices,
  manualPayments,
  orders,
  phoneCalls,
  quotes,
  reviewRequests,
  salesAgentConversations,
  serviceTickets,
  ticketEvents,
  tiffinDriverLinks,
  tiffinSubscriptions,
  whatsappMessages,
  whatsappSessions,
} from "@ll/db";
import { RETENTION, daysAgo, monthsAgo } from "@ll/shared";
import type { AppContext } from "../context.js";
import { deleteStoredPhotos } from "./privacy-scrub.js";

export type RetentionReport = Record<string, number>;
const gone = (rows: unknown[]) => rows.length;
const newToken = sql<string>`'deleted-' || gen_random_uuid()::text`;
const PHONE_MASKS = ["[expired]", "[deleted]"];

/** Phone-call transcripts and the order text drafted from them, and the caller's number. The confirmed order stays. */
export async function scrubPhoneCalls(ctx: AppContext): Promise<number> {
  const cutoff = daysAgo(ctx.now(), RETENTION.phoneTranscriptDays);
  return gone(
    await ctx.db
      .update(phoneCalls)
      .set({ transcript: null, draftOrder: null, fromPhone: "[expired]" })
      .where(and(lt(phoneCalls.createdAt, cutoff), or(isNotNull(phoneCalls.transcript), isNotNull(phoneCalls.draftOrder), notInArray(phoneCalls.fromPhone, PHONE_MASKS))))
      .returning({ id: phoneCalls.id }),
  );
}

/** WhatsApp message bodies past the period are deleted; carts and allergy notes on chats that went quiet are cleared. */
export async function purgeWhatsappMessages(ctx: AppContext): Promise<{ messages: number; sessions: number }> {
  const cutoff = daysAgo(ctx.now(), RETENTION.whatsappMessageDays);
  const messages = gone(await ctx.db.delete(whatsappMessages).where(lt(whatsappMessages.createdAt, cutoff)).returning({ id: whatsappMessages.id }));
  const sessions = gone(
    await ctx.db
      .update(whatsappSessions)
      .set({ cart: [], allergyNote: null, updatedAt: whatsappSessions.updatedAt })
      .where(and(lt(sql`coalesce(${whatsappSessions.lastInboundAt}, ${whatsappSessions.updatedAt})`, cutoff), or(sql`jsonb_array_length(${whatsappSessions.cart}) > 0`, isNotNull(whatsappSessions.allergyNote))))
      .returning({ id: whatsappSessions.id }),
  );
  return { messages, sessions };
}

/**
 * Sales assistant chats (web and WhatsApp, our own number): the whole conversation (messages, tool-call records, the number)
 * once it has been quiet for the period, whatever its status (a hand-off nobody picked up in that long is stale; the lead, if one
 * was created, is the follow-up record and follows the rep console's own rules).
 */
export async function purgeSalesAgentChats(ctx: AppContext): Promise<number> {
  const cutoff = daysAgo(ctx.now(), RETENTION.salesAgentDays);
  return gone(await ctx.db.delete(salesAgentConversations).where(lt(salesAgentConversations.lastActivityAt, cutoff)).returning({ id: salesAgentConversations.id }));
}

/**
 * Closed repair tickets (picked up or cancelled) older than the period: the photos (files deleted from the object
 * store, then the links), the item and issue text, intake and timeline notes, and the quote e-signature record.
 * Quote and invoice amounts stay.
 */
export async function purgeClosedTickets(ctx: AppContext): Promise<{ tickets: number; files: number }> {
  const cutoff = monthsAgo(ctx.now(), RETENTION.repairPhotoMonths);
  const rows = await ctx.db
    .select({ id: serviceTickets.id, photos: serviceTickets.photos })
    .from(serviceTickets)
    .where(
      and(
        inArray(serviceTickets.status, ["picked_up", "cancelled"]),
        lt(serviceTickets.updatedAt, cutoff),
        or(sql`jsonb_array_length(${serviceTickets.photos}) > 0`, sql`${serviceTickets.issue} <> '[expired]'`),
      ),
    )
    .limit(1000);
  if (!rows.length) return { tickets: 0, files: 0 };
  const ids = rows.map((r) => r.id);
  // Files first: if the delete of a file fails we still blank the link (the file is unguessable and the failure is logged).
  const files = await deleteStoredPhotos(ctx, rows.flatMap((r) => r.photos ?? []));
  await ctx.db.transaction(async (tx) => {
    await tx.update(serviceTickets).set({ photos: [], issue: "[expired]", itemDetails: {}, intakeNotes: null, shelfLocation: null, statusToken: null, updatedAt: serviceTickets.updatedAt }).where(inArray(serviceTickets.id, ids));
    await tx.update(ticketEvents).set({ note: null }).where(inArray(ticketEvents.ticketId, ids));
    await tx.update(quotes).set({ signatureName: null, signatureIp: null, signatureUserAgent: null, authorizedBy: null, declineReason: null, diagnosis: null, approvalToken: newToken }).where(inArray(quotes.ticketId, ids));
  });
  return { tickets: rows.length, files };
}

/** Private review comments and the shop's reply. The star rating stays, it identifies no one. */
export async function scrubReviewFeedback(ctx: AppContext): Promise<number> {
  const cutoff = monthsAgo(ctx.now(), RETENTION.reviewFeedbackMonths);
  return gone(
    await ctx.db
      .update(reviewRequests)
      .set({ feedback: null, replyBody: null, replyChannel: null })
      .where(and(lt(reviewRequests.createdAt, cutoff), or(isNotNull(reviewRequests.feedback), isNotNull(reviewRequests.replyBody))))
      .returning({ id: reviewRequests.id }),
  );
}

/** Driver links stop working the same night; the row (route, day, when opened) is deleted after the period. */
export async function purgeDriverLinks(ctx: AppContext): Promise<number> {
  const cutoff = daysAgo(ctx.now(), RETENTION.driverLinkDays);
  return gone(await ctx.db.delete(tiffinDriverLinks).where(lt(tiffinDriverLinks.expiresAt, cutoff)).returning({ id: tiffinDriverLinks.id }));
}

/** Delivery address, postal code, location, delivery and dietary notes of subscriptions that ended more than the period ago. */
export async function scrubTiffinAddresses(ctx: AppContext): Promise<number> {
  const cutoff = monthsAgo(ctx.now(), RETENTION.tiffinAddressMonths);
  return gone(
    await ctx.db
      .update(tiffinSubscriptions)
      .set({ address: null, addressNotes: null, postalCode: null, lat: null, lng: null, dietaryNotes: null, updatedAt: tiffinSubscriptions.updatedAt })
      .where(
        and(
          eq(tiffinSubscriptions.status, "cancelled"),
          lt(tiffinSubscriptions.cancelledAt, cutoff),
          or(isNotNull(tiffinSubscriptions.address), isNotNull(tiffinSubscriptions.addressNotes), isNotNull(tiffinSubscriptions.postalCode), isNotNull(tiffinSubscriptions.lat), isNotNull(tiffinSubscriptions.dietaryNotes)),
        ),
      )
      .returning({ id: tiffinSubscriptions.id }),
  );
}

/** Allergy notes on orders that are done (picked up or cancelled) for longer than the period. The order stays. */
export async function scrubAllergyNotes(ctx: AppContext): Promise<number> {
  const cutoff = daysAgo(ctx.now(), RETENTION.allergyNoteDays);
  return gone(
    await ctx.db
      .update(orders)
      .set({ allergyNote: null, updatedAt: orders.updatedAt })
      .where(and(inArray(orders.status, ["picked_up", "cancelled", "refunded"]), isNotNull(orders.allergyNote), lt(sql`coalesce(${orders.pickedUpAt}, ${orders.updatedAt})`, cutoff)))
      .returning({ id: orders.id }),
  );
}

/** Appointment notes and the name typed at the desk, after the visit. The appointment, its services and its money stay. */
export async function scrubAppointments(ctx: AppContext): Promise<number> {
  const cutoff = monthsAgo(ctx.now(), RETENTION.appointmentMonths);
  return gone(
    await ctx.db
      .update(appointments)
      .set({ customerName: null, notes: null, clientNote: null, updatedAt: appointments.updatedAt })
      .where(and(lt(appointments.endsAt, cutoff), or(isNotNull(appointments.customerName), isNotNull(appointments.notes), isNotNull(appointments.clientNote))))
      .returning({ id: appointments.id }),
  );
}

/** Unpaid holds that lapsed (a chair held for a customer who never paid, a hall hold nobody confirmed) are deleted after the period. */
export async function purgeAbandonedHolds(ctx: AppContext): Promise<{ appointments: number; halls: number }> {
  const cutoff = daysAgo(ctx.now(), RETENTION.abandonedHoldDays);
  const appts = gone(
    await ctx.db
      .delete(appointments)
      .where(and(eq(appointments.status, "cancelled"), eq(appointments.cancelReason, "hold_expired"), isNull(appointments.depositPaidAt), isNull(appointments.depositProcessingAt), isNull(appointments.invoiceId), lt(appointments.cancelledAt, cutoff)))
      .returning({ id: appointments.id }),
  );
  const halls = gone(
    await ctx.db
      .delete(hallBookings)
      .where(
        and(
          eq(hallBookings.status, "cancelled"),
          isNotNull(hallBookings.holdExpiresAt),
          lt(hallBookings.holdExpiresAt, cutoff),
          isNull(hallBookings.depositPaidAt),
          isNull(hallBookings.depositProcessingAt),
          sql`not exists (select 1 from ${invoices} where ${invoices.hallBookingId} = ${hallBookings.id})`,
          sql`not exists (select 1 from ${manualPayments} where ${manualPayments.subjectType} = 'hall_instalment' and ${manualPayments.subjectId} = ${hallBookings.id})`,
        ),
      )
      .returning({ id: hallBookings.id }),
  );
  return { appointments: appts, halls };
}

/** Every rule, once. Returns what each one removed; writes one audit row when anything was removed. */
export async function runRetention(ctx: AppContext): Promise<RetentionReport> {
  const walog = await purgeWhatsappMessages(ctx);
  const tickets = await purgeClosedTickets(ctx);
  const holds = await purgeAbandonedHolds(ctx);
  const report: RetentionReport = {
    phoneCalls: await scrubPhoneCalls(ctx),
    whatsappMessages: walog.messages,
    whatsappSessions: walog.sessions,
    tickets: tickets.tickets,
    photoFiles: tickets.files,
    reviewFeedback: await scrubReviewFeedback(ctx),
    driverLinks: await purgeDriverLinks(ctx),
    tiffinAddresses: await scrubTiffinAddresses(ctx),
    allergyNotes: await scrubAllergyNotes(ctx),
    appointments: await scrubAppointments(ctx),
    holdAppointments: holds.appointments,
    holdHalls: holds.halls,
    salesAgentChats: await purgeSalesAgentChats(ctx),
  };
  if (Object.values(report).some((n) => n > 0)) await ctx.db.insert(auditLogs).values({ actorUserId: null, action: "retention.run", entity: "system", data: report, createdAt: ctx.now() });
  return report;
}
