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
import { writeAudit } from "./admin-audit.js";
import { requirePhone } from "./merchant.js";

const HOUR = 3_600_000;
const KIND_LABEL: Record<repApi.PublicLeadKind, string> = { book_visit: "Book a visit", talk_to_us: "Talk to us", bia: "BIA enquiry" };
/** Per-context so tests (one ctx each) don't share counters. */
const hitsByCtx = new WeakMap<AppContext, Map<string, number[]>>();

function checkRate(ctx: AppContext, ip: string) {
  let hits = hitsByCtx.get(ctx);
  if (!hits) hitsByCtx.set(ctx, (hits = new Map()));
  const now = ctx.now().getTime();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= repApi.PUBLIC_LEAD_RATE_LIMIT_PER_HOUR) {
    hits.set(ip, recent);
    throw tooMany("Too many requests. Try again in an hour, or email us directly.");
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < HOUR)) hits.delete(k);
}

export async function createPublicLead(ctx: AppContext, body: repApi.PublicLeadBody, ip: string): Promise<repApi.PublicLeadResponse> {
  const phone = body.phone ? requirePhone(body.phone) : null;
  checkRate(ctx, ip);
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
      vertical: body.vertical ?? null,
      neighbourhoodId: hood?.id ?? null,
      notes,
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
