/**
 * What "delete my account" does to every module, written once so the account-deletion service and the tests
 * read the same list. The privacy policy (section 5) promises this reaches orders, appointments, tiffin,
 * catering, hall bookings, WhatsApp, phone calls, review feedback, repair tickets, wait lists, referrals and
 * consents, and keeps only what law or accounting needs, de-identified.
 *
 * Rules:
 *  - Free text a customer typed (names, addresses, notes, signatures, IP and device, allergy and dietary notes,
 *    transcripts, message bodies, photos) is cleared or deleted.
 *  - Money records stay (paid invoices, charges, deposits, manual payments): amounts, dates and status only. They
 *    point at the deleted user row, which no longer holds a name, phone or email, so they identify no one. Bank
 *    references and payer notes are cleared.
 *  - Future bookings and subscriptions are cancelled so nothing is sent or billed after deletion.
 *  - The do-not-contact list (comm_opt_outs) is kept on purpose: deleting it would let a number we were told to
 *    stop contacting be contacted again.
 */
import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import {
  appointments,
  classBookings,
  familyMembers,
  petVaccines,
  petVisits,
  pets,
  foodCards,
  daycarePacks,
  tireSets,
  tireSwaps,
  vehicles,
  washVisits,
  preferredStaff,
  queueEntries,
  classMemberships,
  bookings,
  cateringEvents,
  hallBookings,
  manualPayments,
  merchantMembers,
  notifications,
  orderSplits,
  orders,
  phoneCalls,
  salesAgentConversations,
  preorderWaitlist,
  quotes,
  rebookingNudges,
  referrals,
  reviewRequests,
  serviceTickets,
  ticketEvents,
  tiffinDeliveries,
  tiffinSkips,
  tiffinSubscriptions,
  tiffinCharges,
  invoices,
  userNotificationPrefs,
  walletDeviceRegistrations,
  walletPasses,
  whatsappMessages,
  whatsappSessions,
  type DbOrTx,
} from "@ll/db";
import type { AppContext } from "../context.js";
import { getStorage, storageKeyFromUrl } from "../providers/storage.js";

/** Per-module counts, for the audit log and the tests. */
export type ScrubReport = Record<string, number>;

const newToken = sql<string>`'deleted-' || gen_random_uuid()::text`;

/** Delete the stored files behind a list of upload URLs. Never throws: a file that is already gone is fine. */
export async function deleteStoredPhotos(ctx: AppContext, urls: string[]): Promise<number> {
  const storage = getStorage(ctx);
  let n = 0;
  for (const url of urls) {
    const key = storageKeyFromUrl(url);
    if (!key || !storage.delete) continue;
    try {
      if (await storage.delete(key)) n++;
    } catch (err) {
      if (ctx.config.env !== "test") console.error("[privacy] photo delete failed", key, err);
    }
  }
  return n;
}

/**
 * Scrub one customer's data in every module, inside the caller's transaction. `phone` is the number the
 * account had (WhatsApp chats, phone calls and wait-list entries are keyed by number). Returns the counts and the
 * photo URLs to delete from the object store once the transaction has committed.
 */
export async function scrubCustomerData(tx: DbOrTx, userId: string, phone: string | null, now: Date): Promise<{ report: ScrubReport; photoUrls: string[] }> {
  const report: ScrubReport = {};
  const count = (k: string, rows: unknown[]) => void (report[k] = rows.length);

  // Appointments: names and notes cleared; future ones cancelled; saved-card references dropped.
  count("appointments", await tx.update(appointments).set({ customerName: null, notes: null, clientNote: null, stripeCustomerId: null, cardSetupIntentId: null, paymentMethodId: null, holdExpiresAt: null, updatedAt: now }).where(eq(appointments.userId, userId)).returning({ id: appointments.id }));
  await tx
    .update(appointments)
    .set({ status: "cancelled", cancelledAt: now, cancelReason: "account_deleted" })
    .where(and(eq(appointments.userId, userId), eq(appointments.status, "booked"), gt(appointments.startsAt, now)));
  // Classes: saved-card references dropped, memberships ended, upcoming classes cancelled; the member's name leaves the stored agreement.
  count("classMemberships", await tx.update(classMemberships).set({ stripeCustomerId: null, paymentMethodId: null, paymentMethodBrand: null, paymentMethodLast4: null, setupIntentId: null, nextBillingDate: null, status: sql`case when ${classMemberships.status} in ('cancelled','expired') then ${classMemberships.status} else 'cancelled' end`, cancelledAt: sql`coalesce(${classMemberships.cancelledAt}, ${now.toISOString()}::timestamptz)`, cancelReason: sql`coalesce(${classMemberships.cancelReason}, 'account_deleted')`, agreementText: sql`regexp_replace(${classMemberships.agreementText}, 'Member: [^\n]*', 'Member: deleted account')`, updatedAt: now }).where(eq(classMemberships.userId, userId)).returning({ id: classMemberships.id }));
  await tx.update(classBookings).set({ status: "cancelled", cancelledAt: now, holdExpiresAt: null, updatedAt: now }).where(and(eq(classBookings.userId, userId), inArray(classBookings.status, ["held", "booked", "waitlisted"])));
  count("bookings", await tx.update(bookings).set({ notes: null }).where(eq(bookings.userId, userId)).returning({ id: bookings.id }));
  // Barbershops: family members (a first name each), their places in a line and "my barber" go with the account.
  count("familyMembers", await tx.delete(familyMembers).where(eq(familyMembers.userId, userId)).returning({ id: familyMembers.id }));
  await tx.delete(queueEntries).where(eq(queueEntries.userId, userId));
  await tx.delete(preferredStaff).where(eq(preferredStaff.userId, userId));
  count("rebookingNudges", await tx.delete(rebookingNudges).where(eq(rebookingNudges.userId, userId)).returning({ id: rebookingNudges.id }));

  // Tiffin: address, notes, location, saved payment references, skip reasons and delivery notes; subscription ends.
  const subs = await tx.update(tiffinSubscriptions).set({
    address: null, addressNotes: null, postalCode: null, lat: null, lng: null, dietaryNotes: null, routeId: null, stopOrder: null,
    stripeCustomerId: null, paymentMethodId: null, paymentMethodBrand: null, paymentMethodLast4: null, setupIntentId: null,
    nextBillingDate: null, pausedUntil: null, updatedAt: now,
  }).where(eq(tiffinSubscriptions.userId, userId)).returning({ id: tiffinSubscriptions.id, status: tiffinSubscriptions.status });
  report.tiffinSubscriptions = subs.length;
  const subIds = subs.map((s) => s.id);
  if (subIds.length) {
    await tx.update(tiffinSubscriptions).set({ status: "cancelled", cancelledAt: now, cancelReason: "account_deleted" }).where(and(inArray(tiffinSubscriptions.id, subIds), sql`${tiffinSubscriptions.status} <> 'cancelled'`));
    count("tiffinSkips", await tx.update(tiffinSkips).set({ reason: null }).where(inArray(tiffinSkips.subscriptionId, subIds)).returning({ d: tiffinSkips.date }));
    count("tiffinDeliveries", await tx.update(tiffinDeliveries).set({ note: null }).where(inArray(tiffinDeliveries.subscriptionId, subIds)).returning({ id: tiffinDeliveries.id }));
    await tx.update(tiffinDeliveries).set({ status: "skipped" }).where(and(inArray(tiffinDeliveries.subscriptionId, subIds), eq(tiffinDeliveries.status, "scheduled"), gt(tiffinDeliveries.date, now.toISOString().slice(0, 10))));
    // Payments recorded by hand keep method, amount and date; the bank reference and note can carry a name.
    const charges = await tx.select({ id: tiffinCharges.id }).from(tiffinCharges).where(inArray(tiffinCharges.subscriptionId, subIds));
    if (charges.length) await tx.update(manualPayments).set({ bankReference: null, note: null }).where(and(eq(manualPayments.subjectType, "tiffin_charge"), inArray(manualPayments.subjectId, charges.map((c) => c.id))));
  }

  // Catering events: venue, notes, dietary notes, the signature record (name, IP, device) and the approval link.
  const events = await tx.update(cateringEvents).set({
    venueName: null, venueAddress: null, dietaryNotes: null, notes: null, signatureName: null, signatureIp: null, signatureUserAgent: null,
    approvalToken: newToken, updatedAt: now,
  }).where(eq(cateringEvents.userId, userId)).returning({ id: cateringEvents.id });
  report.cateringEvents = events.length;
  const hall = await tx.update(hallBookings).set({ notes: null }).where(eq(hallBookings.userId, userId)).returning({ id: hallBookings.id });
  report.hallBookings = hall.length;
  const moneySubjects = [...events.map((e) => e.id), ...hall.map((h) => h.id)];
  if (moneySubjects.length) await tx.update(manualPayments).set({ bankReference: null, note: null }).where(and(inArray(manualPayments.subjectType, ["catering_deposit", "catering_balance", "hall_instalment"]), inArray(manualPayments.subjectId, moneySubjects)));

  // WhatsApp chats (keyed by user or number): messages deleted, cart and allergy note cleared, number replaced.
  const sessionWhere = phone ? or(eq(whatsappSessions.userId, userId), eq(whatsappSessions.phone, phone)) : eq(whatsappSessions.userId, userId);
  const sessions = await tx.select({ id: whatsappSessions.id }).from(whatsappSessions).where(sessionWhere);
  report.whatsappSessions = sessions.length;
  if (sessions.length) {
    const ids = sessions.map((s) => s.id);
    count("whatsappMessages", await tx.delete(whatsappMessages).where(inArray(whatsappMessages.sessionId, ids)).returning({ id: whatsappMessages.id }));
    for (const id of ids) {
      await tx.update(whatsappSessions).set({ phone: sql`'deleted-' || ${id}::text`, userId: null, cart: [], allergyNote: null, marketingOptInAt: null, state: "opted_out", takenOverAt: null, takenOverBy: null, updatedAt: now }).where(eq(whatsappSessions.id, id));
    }
  }

  // Sales assistant chats (our own WhatsApp number and the website chat), keyed by the number or the verified owner: deleted with their messages.
  count("salesAgentChats", await tx.delete(salesAgentConversations).where(phone ? or(eq(salesAgentConversations.verifiedUserId, userId), eq(salesAgentConversations.phone, phone)) : eq(salesAgentConversations.verifiedUserId, userId)).returning({ id: salesAgentConversations.id }));

  // Phone calls (keyed by the caller's number): transcript, drafted order and number.
  if (phone) count("phoneCalls", await tx.update(phoneCalls).set({ transcript: null, draftOrder: null, fromPhone: "[deleted]" }).where(eq(phoneCalls.fromPhone, phone)).returning({ id: phoneCalls.id }));

  // Review requests: the comment, the shop's reply and the link token. The 1-5 rating stays, de-identified.
  count("reviewRequests", await tx.update(reviewRequests).set({ feedback: null, replyBody: null, replyChannel: null, token: newToken }).where(eq(reviewRequests.userId, userId)).returning({ id: reviewRequests.id }));

  // Repair tickets: item details, description, notes, photos (files are deleted after commit), shelf, status link, timeline notes.
  const tickets = await tx.select({ id: serviceTickets.id, photos: serviceTickets.photos }).from(serviceTickets).where(eq(serviceTickets.userId, userId));
  report.serviceTickets = tickets.length;
  const photoUrls = tickets.flatMap((t) => t.photos ?? []);
  // Pet care: pets, vaccine proof photos, visits and report cards, food cards and daycare packs go with the account (the proof and report photos are deleted from storage).
  const myPets = await tx.select({ id: pets.id }).from(pets).where(eq(pets.userId, userId));
  if (myPets.length) {
    const petIds = myPets.map((p) => p.id);
    const proofs = await tx.select({ u: petVaccines.proofUrl }).from(petVaccines).where(inArray(petVaccines.petId, petIds));
    const shots = await tx.select({ u: petVisits.photoUrl }).from(petVisits).where(inArray(petVisits.petId, petIds));
    photoUrls.push(...[...proofs, ...shots].map((x) => x.u).filter((u): u is string => !!u));
  }
  count("pets", await tx.delete(pets).where(eq(pets.userId, userId)).returning({ id: pets.id }));
  await tx.delete(foodCards).where(eq(foodCards.userId, userId));
  await tx.delete(daycarePacks).where(eq(daycarePacks.userId, userId));
  // Auto care: vehicles (with plate, odometer readings, service log and reminder records), stored tire sets, swap bookings and wash visits.
  count("vehicles", await tx.delete(vehicles).where(eq(vehicles.userId, userId)).returning({ id: vehicles.id }));
  await tx.delete(tireSets).where(eq(tireSets.userId, userId));
  await tx.delete(tireSwaps).where(eq(tireSwaps.userId, userId));
  await tx.delete(washVisits).where(eq(washVisits.userId, userId));
  report.photos = photoUrls.length;
  if (tickets.length) {
    const ids = tickets.map((t) => t.id);
    await tx.update(serviceTickets).set({ itemDetails: {}, issue: "[deleted]", intakeNotes: null, photos: [], shelfLocation: null, statusToken: null }).where(inArray(serviceTickets.id, ids));
    count("ticketEvents", await tx.update(ticketEvents).set({ note: null }).where(inArray(ticketEvents.ticketId, ids)).returning({ id: ticketEvents.id }));
    // Quotes keep totals and line items for the shop's books; the e-signature (name, IP, device), who authorised it, and the decline reason go.
    count("quotes", await tx.update(quotes).set({ signatureName: null, signatureIp: null, signatureUserAgent: null, authorizedBy: null, declineReason: null, diagnosis: null, approvalToken: newToken }).where(inArray(quotes.ticketId, ids)).returning({ id: quotes.id }));
  }
  // Invoices keep amounts and dates (tax and accounting); only the pay link is revoked.
  count("invoices", await tx.update(invoices).set({ payToken: newToken }).where(eq(invoices.userId, userId)).returning({ id: invoices.id }));

  // Orders keep totals; the free-text note and allergy note go. Split labels can be first names.
  const ords = await tx.update(orders).set({ allergyNote: null, notes: null }).where(eq(orders.userId, userId)).returning({ id: orders.id });
  report.orders = ords.length;
  if (ords.length) await tx.update(orderSplits).set({ label: "[deleted]", payToken: newToken }).where(inArray(orderSplits.orderId, ords.map((o) => o.id)));

  // Wait lists (by user or number): deleted, with the consent wording they carried.
  count("waitlist", await tx.delete(preorderWaitlist).where(phone ? or(eq(preorderWaitlist.userId, userId), eq(preorderWaitlist.phone, phone)) : eq(preorderWaitlist.userId, userId)).returning({ id: preorderWaitlist.id }));

  // Referrals: ones this person made are deleted; where they were the referee the link to them is cut.
  const mine = await tx.select({ id: merchantMembers.id }).from(merchantMembers).where(eq(merchantMembers.userId, userId));
  if (mine.length) count("referralsMade", await tx.delete(referrals).where(inArray(referrals.referrerMemberId, mine.map((m) => m.id))).returning({ id: referrals.id }));
  count("referralsReceived", await tx.update(referrals).set({ refereeUserId: null }).where(eq(referrals.refereeUserId, userId)).returning({ id: referrals.id }));

  // Consents and preferences: marketing consent text lives on merchant_members (cleared by deleteAccount); here the
  // per-type notification choices, the inbox, wallet device registrations and the member tags/notes.
  count("notificationPrefs", await tx.delete(userNotificationPrefs).where(eq(userNotificationPrefs.userId, userId)).returning({ id: userNotificationPrefs.id }));
  count("notifications", await tx.delete(notifications).where(eq(notifications.userId, userId)).returning({ id: notifications.id }));
  const passes = await tx.select({ id: walletPasses.id }).from(walletPasses).where(eq(walletPasses.userId, userId));
  if (passes.length) await tx.delete(walletDeviceRegistrations).where(inArray(walletDeviceRegistrations.passId, passes.map((p) => p.id)));
  await tx.update(merchantMembers).set({ tags: [] }).where(eq(merchantMembers.userId, userId));

  return { report, photoUrls };
}
