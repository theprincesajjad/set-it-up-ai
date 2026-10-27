/**
 * The vehicle estimate rules of the Ontario guide for auto repair businesses (docs/research/auto-care.md 2.4), on top of the
 * existing tickets, quotes and invoices: what an estimate must carry before it is sent, no work or invoice on a vehicle without an
 * approved estimate, the estimate and odometer on the invoice, and the link from a ticket to a vehicle under the customer.
 * The 10% cap and the revised-estimate approval are in invoices.ts and quotes.ts and are not repeated here.
 */
import { and, desc, eq } from "drizzle-orm";
import { quotes, vehicles, type DbOrTx, type LineItem } from "@ll/db";
import { MVR_WARRANTY_DAYS, MVR_WARRANTY_EXEMPT, MVR_WARRANTY_KM, PARTS_RETURN, estimateMissing, maxAuthorizedCents, percentOver, type serviceApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { HttpError, badRequest } from "../lib/errors.js";
import type { Invoice } from "./invoices.js";
import { itemLabel } from "./commerceShared.js";
import { readingFromTicket } from "./auto-vehicles.js";
import type { merchants, serviceTickets } from "@ll/db";

type Ticket = typeof serviceTickets.$inferSelect;
type Merchant = typeof merchants.$inferSelect;
type Quote = typeof quotes.$inferSelect;

export const isVehicle = (t: Pick<Ticket, "itemKind">): boolean => t.itemKind === "vehicle";

/** A vehicle estimate is complete when it names the car, the odometer, the completion date, the expiry and each part's condition. Throws 409 `estimate_incomplete` listing what is missing. */
export function assertEstimateComplete(ticket: Ticket, quote: Pick<Quote, "expiresAt" | "lineItems">): void {
  if (!isVehicle(ticket)) return;
  const label = itemLabel(ticket.itemKind, ticket.itemDetails);
  const missing = estimateMissing({
    vehicleLabel: label === "your vehicle" ? null : label,
    mileageIn: ticket.itemDetails.mileage ?? null,
    promisedAt: ticket.promisedAt ? ticket.promisedAt.toISOString() : null,
    expiresAt: quote.expiresAt ? quote.expiresAt.toISOString() : null,
    lines: (quote.lineItems as LineItem[]).map((l) => ({ kind: l.kind ?? null, condition: l.condition ?? null, description: l.description })),
  });
  if (missing.length) throw new HttpError(409, "estimate_incomplete", `An estimate for a vehicle needs ${missing.join(", ")}.`, { missing });
}

/** No work on a vehicle, and no invoice for it, until the customer has approved a written estimate. */
export async function requireApprovedEstimate(db: DbOrTx, ticket: Ticket, what: "work" | "invoice"): Promise<void> {
  if (!isVehicle(ticket)) return;
  const [q] = await db.select({ id: quotes.id }).from(quotes).where(and(eq(quotes.ticketId, ticket.id), eq(quotes.status, "approved"))).limit(1);
  if (q) return;
  throw new HttpError(409, "estimate_required", what === "work" ? "Send the customer a written estimate and have them approve it before work starts on a vehicle." : "A vehicle invoice needs an approved written estimate first.");
}

/** Records the ticket's odometer (in, and out when set) as readings on the vehicle it names. Call after the ticket is saved and the owner checked. */
export async function linkTicketVehicle(ctx: AppContext, merchant: Merchant, ticket: Ticket): Promise<void> {
  const vehicleId = ticket.itemDetails.vehicleId;
  if (!vehicleId || !isVehicle(ticket)) return;
  const [v] = await ctx.db.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, ticket.userId))).limit(1);
  if (!v) return;
  await readingFromTicket(ctx, merchant, v.id, ticket.itemDetails.mileage);
  await readingFromTicket(ctx, merchant, v.id, ticket.itemDetails.mileageOut);
}

/** The vehicle a ticket names must belong to the ticket's customer. */
export async function assertVehicleOwner(db: DbOrTx, userId: string, vehicleId: string | undefined): Promise<void> {
  if (!vehicleId) return;
  const [v] = await db.select({ id: vehicles.id }).from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId))).limit(1);
  if (!v) throw badRequest("That vehicle does not belong to this customer.");
}

/** What the invoice shows beside its lines: the approved estimate, how far over it the invoice is, and the vehicle facts. */
export async function invoiceExtras(db: DbOrTx, inv: Invoice, ticket: Ticket | undefined): Promise<{ estimate: serviceApi.InvoiceEstimateDto | null; vehicle: serviceApi.InvoiceVehicleDto | null }> {
  if (!ticket) return { estimate: null, vehicle: null };
  const [q] = await db.select().from(quotes).where(and(eq(quotes.ticketId, ticket.id), eq(quotes.status, "approved"))).orderBy(desc(quotes.respondedAt)).limit(1);
  const estimate: serviceApi.InvoiceEstimateDto | null = q
    ? { totalCents: q.totalCents, approvedAt: q.respondedAt ? q.respondedAt.toISOString() : null, approvedBy: q.authorizedBy?.name ?? q.signatureName ?? null, method: q.authorizedBy?.method ?? null, percentOver: percentOver(q.totalCents, inv.totalCents), maxAuthorizedCents: maxAuthorizedCents(q.totalCents) }
    : null;
  if (!isVehicle(ticket)) return { estimate, vehicle: null };
  const d = ticket.itemDetails;
  const pr = (PARTS_RETURN as readonly string[]).includes(d.partsReturn ?? "") ? (d.partsReturn as serviceApi.InvoiceVehicleDto["partsReturn"]) : null;
  return {
    estimate,
    vehicle: { label: itemLabel(ticket.itemKind, d), odometerIn: d.mileage ?? null, odometerOut: d.mileageOut ?? null, partsReturn: pr, warrantyDays: MVR_WARRANTY_DAYS, warrantyKm: MVR_WARRANTY_KM, warrantyExempt: MVR_WARRANTY_EXEMPT, estimateGivenAt: q?.sentAt ? q.sentAt.toISOString() : null },
  };
}
