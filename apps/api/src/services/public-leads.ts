/**
 * Marketing-site lead capture (POST /v1/public/leads). Creates an unassigned
 * "new" lead for the rep console and emails the support inbox. Rate-limited
 * per IP in memory (per app instance; good enough for a form behind the site).
 */
import { eq } from "drizzle-orm";
import { leads, neighbourhoods } from "@ll/db";
import { BRAND, repApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { tooMany } from "../lib/errors.js";
import { allow } from "../lib/rate-limit.js";
import { writeAudit } from "./admin-audit.js";
import { requirePhone } from "./merchant.js";

const HOUR = 3_600_000;
const KIND_LABEL: Record<repApi.PublicLeadKind, string> = { book_visit: "Book a visit", talk_to_us: "Talk to us", bia: "BIA enquiry", restaurant: "Restaurant visit" };
const LANGUAGE_LABEL: Record<(typeof repApi.LEAD_LANGUAGES)[number], string> = { en: "English", hi: "Hindi", ur: "Urdu", pa: "Punjabi" };
async function checkRate(ctx: AppContext, ip: string) {
  if (!(await allow(ctx, `public-lead:${ip}`, repApi.PUBLIC_LEAD_RATE_LIMIT_PER_HOUR, HOUR))) throw tooMany("Too many requests. Try again in an hour, or email us directly.");
}

export async function createPublicLead(ctx: AppContext, body: repApi.PublicLeadBody, ip: string): Promise<repApi.PublicLeadResponse> {
  const phone = body.phone ? requirePhone(body.phone) : null;
  await checkRate(ctx, ip);
  const [hood] = body.neighbourhoodSlug
    ? await ctx.db.select({ id: neighbourhoods.id, name: neighbourhoods.name }).from(neighbourhoods).where(eq(neighbourhoods.slug, body.neighbourhoodSlug)).limit(1)
    : [];
  const label = KIND_LABEL[body.kind];
  const notes = [`[website: ${body.kind}]`, body.neighbourhoodSlug && !hood ? `Neighbourhood: ${body.neighbourhoodSlug}` : null, body.message ?? null]
    .filter(Boolean)
    .join("\n");
  const now = ctx.now();
  const [lead] = await ctx.db
    .insert(leads)
    .values({
      businessName: body.businessName,
      contactName: body.contactName ?? null,
      email: body.email ?? null,
      phone,
      vertical: body.kind === "restaurant" ? (body.vertical ?? "restaurant") : (body.vertical ?? null),
      neighbourhoodId: hood?.id ?? null,
      notes,
      language: body.language ?? null,
      contactRole: body.role ?? null,
      eventDate: body.eventDate ?? null,
      boardMeetingAt: body.boardMeetingAt ?? null,
      memberCount: body.memberCount ?? null,
      source: "website",
      stage: "new",
      assignedRepId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: leads.id });
  await writeAudit(ctx.db, { actorUserId: null, action: "lead.public_created", entity: "lead", entityId: lead!.id, data: { kind: body.kind }, ip });
  const text = [
    `New website lead (${label})`,
    `Business: ${body.businessName}`,
    body.contactName ? `Contact: ${body.contactName}` : null,
    body.email ? `Email: ${body.email}` : null,
    phone ? `Phone: ${phone}` : null,
    body.vertical ? `Vertical: ${body.vertical}` : null,
    body.language ? `Language: ${LANGUAGE_LABEL[body.language]}` : null,
    body.role ? `Role: ${body.role}` : null,
    body.eventDate ? `Event date: ${body.eventDate}` : null,
    body.boardMeetingAt ? `Next board meeting: ${body.boardMeetingAt}` : null,
    body.memberCount ? `BIA members: ${body.memberCount}` : null,
    body.neighbourhoodSlug ? `Neighbourhood: ${hood?.name ?? body.neighbourhoodSlug}` : null,
    body.message ? `\n${body.message}` : null,
    `\nLead ${lead!.id} (unassigned, stage "new" in the rep console)`,
  ]
    .filter((l) => l !== null)
    .join("\n");
  try {
    await ctx.providers.email.send({ to: BRAND.supportEmail, subject: `${label}: ${body.businessName}`, text });
  } catch (err) {
    // The lead is saved; a mail outage must not lose it or fail the form.
    if (ctx.config.env !== "test") console.error("[public-leads] email failed", err);
  }
  return { id: lead!.id, received: true };
}
