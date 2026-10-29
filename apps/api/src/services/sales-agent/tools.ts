/**
 * The assistant's tools. Two rules shape all of them:
 *
 *  1. No tool takes a merchant, user or conversation id from the model. Account tools read `conv.verifiedUserId`, which only
 *     the server sets after the SMS code was typed back, and act on the shops that user owns. Text in a chat (or injected into
 *     a tool result) cannot point a tool at somebody else's data, because there is nowhere to put the pointer.
 *  2. Tools that change something (create_lead, start_signup, request_founder_call, create_checkout_link) run in two steps. The
 *     first call stores the exact arguments and returns a summary; the second call (with the confirmation_id) executes the STORED
 *     arguments, and only on a later user turn than the first. So a reply that arrives in the same turn (an injected instruction,
 *     a model slip) cannot run an action the person never saw, and the arguments cannot change between "yes" and the action.
 */
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { merchantStaff, merchants, subscriptions, users } from "@ll/db";
import { ADD_ONS, ADD_ON_IDS, FOUNDING_OFFER, PLANS, PLAN_IDS, RESTAURANT_PLANS, RESTAURANT_TIERS, WHATSAPP_PACK_MESSAGES, isPlanAvailable, legalTokens, normalizePhone, type AgentLang, type RestaurantTier } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { randomToken } from "../../lib/crypto.js";
import { HttpError } from "../../lib/errors.js";
import { allow } from "../../lib/rate-limit.js";
import { startAgentVerification } from "../auth.js";
import { startCheckout } from "../billing.js";
import { startRestaurantCheckout } from "../billing-restaurant.js";
import { getRolloutStages } from "../features.js";
import { foundingCorridors, publicPlans } from "../network.js";
import { createPublicLead } from "../public-leads.js";
import { writeAudit } from "../admin-audit.js";
import type { ToolDef } from "./llm.js";
import { searchKnowledge, SOURCE_LABEL, type KnowledgeSource } from "./knowledge.js";
import { consoleLink, escalate, maskPhone, maskValue, notifyTeam, updateConversation, type Conv } from "./store.js";

export const VERIFY_TTL_MS = 60 * 60_000;
export const LIVE_PROOF_MIN_SHOPS = 10;

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra });
function def(name: string, description: string, props: Record<string, unknown>): ToolDef {
  return { name, description, input_schema: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false }, strict: true };
}
const confirmProp = { confirmation_id: nullable("string", { description: "Null on the first call. On the second call, the confirmation_id the first call returned, only after the person said yes in a NEW message." }) };

export const TOOLS: ToolDef[] = [
  def("get_pricing", "Current plans, prices, annual prices, add-ons, platform fees, the founding offer and what is open to buy today. The only source for any figure you state. Prices are in CAD before HST.", {
    topic: { type: "string", enum: ["all", "shop_plans", "restaurant_plans", "add_ons", "fees", "founding_offer"], description: "What to return. Use all when unsure." },
  }),
  def("search_knowledge", "Search the FAQ and our draft legal pages (terms, privacy, merchant agreement, rewards terms) for how things work: contracts, cancelling, data ownership, languages, set-up time, POS, delivery, halal, WhatsApp, privacy. Write the query in English.", {
    query: { type: "string", description: "A short English search query." },
    source: { type: ["string", "null"], enum: ["faq", "legal", null], description: "faq, legal, or null for both." },
  }),
  def("get_network_stats", "Live public counts for the network (shops, streets). Only quote them when quotable is true.", {}),
  def("create_lead", "Save the person as a lead for the team to contact (with their consent). Two steps: call once without confirmation_id, show the summary, ask yes or no. Needs a phone or an email.", {
    business_name: { type: "string" },
    contact_name: nullable("string"),
    phone: nullable("string", { description: "Mobile number the team may call or text." }),
    email: nullable("string"),
    vertical: nullable("string", { description: "For example restaurant, cafe, salon, repair." }),
    notes: nullable("string", { description: "One or two sentences on what they want." }),
    ...confirmProp,
  }),
  def("start_signup", "Send the person a sign-up link pre-filled with their shop details. Two steps: call once without confirmation_id, show the summary, ask yes or no.", {
    kind: { type: "string", enum: ["shop", "restaurant"] },
    business_name: nullable("string"),
    phone: nullable("string"),
    plan_interest: nullable("string", { description: "Free, Pro, Service, or a restaurant tier name, if they said." }),
    ...confirmProp,
  }),
  def("request_founder_call", "Record a request for a call with the founder, at the time the person prefers, and tell the team. It is a request, not a booking: the team confirms. Two steps: call once without confirmation_id, show the summary, ask yes or no. Needs a phone or an email.", {
    preferred_time_text: { type: "string", description: "In the person's words, for example 'Tuesday after 3pm Toronto time'." },
    preferred_time_iso: nullable("string", { description: "ISO 8601 with offset if the time is clear (assume America/Toronto), else null." }),
    business_name: nullable("string"),
    contact_name: nullable("string"),
    phone: nullable("string"),
    email: nullable("string"),
    topic: nullable("string"),
    ...confirmProp,
  }),
  def("request_phone_verification", "Text a 6-digit code to a phone number so the person can prove they own a shop account. The reply is the same whether or not the number belongs to an owner. Tell the person to type just the code.", {
    phone: { type: "string", description: "The owner's mobile number." },
  }),
  def("get_my_account", "The verified owner's own shops: plan, status, restaurant tier, subscription state. Only works after the phone code succeeded. Takes no id: it can only ever return this person's own shops.", {}),
  def("create_checkout_link", "Create a checkout link for a plan on one of the verified owner's own shops. Fails if that plan is not open yet or they are already on it. Two steps: call once without confirmation_id, show the summary, ask yes or no.", {
    product: { type: "string", enum: ["shop_plan", "restaurant_plan"] },
    plan: { type: ["string", "null"], enum: ["plus", "studio", "pro", null], description: `For shop_plan: plus = the ${PLANS.plus.name} plan ($${PLANS.plus.priceCents / 100} a month, one person; its id is plus), studio = the ${PLANS.studio.name} plan ($${PLANS.studio.priceCents / 100}, a shop with chairs), pro = the ${PLANS.pro.name} plan ($${PLANS.pro.priceCents / 100}; its id is pro).` },
    tier: { type: ["string", "null"], enum: ["starter", "growth", "pro", null], description: "For restaurant_plan." },
    interval: { type: "string", enum: ["month", "year"] },
    shop_number: nullable("integer", { description: "The # of the shop from get_my_account. Null when they own one." }),
    ...confirmProp,
  }),
  def("escalate_to_human", "Hand the chat to a person on the team. Use when you do not know, are not allowed to promise, the person asks, or something needs judgment. After calling it, tell the person a person will reply here.", {
    reason: { type: "string", description: "One short sentence for the team: what the person needs and what you could not answer." },
  }),
];

export interface ToolRun {
  ok: boolean;
  /** What the model sees (JSON). */
  data: unknown;
  /** Short line for the admin transcript (no personal data). */
  summary: string;
  /** The conversation row after the tool (it may have changed). */
  conv: Conv;
}

interface Ctx {
  ctx: AppContext;
  conv: Conv;
  lang: AgentLang;
}

const str = (v: unknown, max = 300): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const fmt = (cents: number): string => {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d.toLocaleString("en-CA") : d.toFixed(2)}`;
};

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------
export async function getPricing(ctx: AppContext, topic: string | null): Promise<unknown> {
  const t = legalTokens();
  const stages = await getRolloutStages(ctx.db);
  const want = (k: string) => !topic || topic === "all" || topic === k;
  const out: Record<string, unknown> = { currency: "CAD", note: "All prices are before HST. Annual plans pay 10 months, not 12. No contract and no setup fee." };
  if (want("shop_plans"))
    out.shop_plans = PLAN_IDS.map((id) => {
      const available = isPlanAvailable(id, stages);
      return {
        id,
        name: PLANS[id].name,
        monthly: t[`plan.${id}.price`],
        annual: t[`plan.${id}.annual`],
        includes: PLANS[id].blurb,
        best_for: PLANS[id].bestFor,
        sms_per_month_included: PLANS[id].smsPerMonth,
        status: id === "free" ? "open to every shop now" : available ? "open now" : "not open to every shop yet: pilot shops have it today; it opens as the network grows (do not promise a date)",
      };
    });
  if (want("restaurant_plans"))
    out.restaurant_plans = {
      note: "A separate ladder for restaurants, sweet shops and tiffin kitchens. Any restaurant plan includes everything in the Pro plan.",
      tiers: RESTAURANT_TIERS.map((k) => ({ tier: k, name: RESTAURANT_PLANS[k].name, monthly: t[`restaurant.${k}.price`], annual: t[`restaurant.${k}.annual`], includes: RESTAURANT_PLANS[k].blurb, whatsapp_messages_included_per_month: RESTAURANT_PLANS[k].whatsappPerMonth, status: "open now" })),
    };
  if (want("add_ons")) out.add_ons = ADD_ON_IDS.map((id) => ({ id, name: ADD_ONS[id].name, price: t[`addon.${id}.price`], whatsapp_pack_messages: id === "whatsapp_1000" ? WHATSAPP_PACK_MESSAGES : undefined }));
  if (want("fees"))
    out.fees = {
      online_orders_on_restaurant_or_paid_plan: t["fee.orderPaid"],
      online_orders_on_free_plan: t["fee.orderFree"],
      optional_customer_service_fee_per_order: t["fee.customerService"],
      deposits_and_invoices: t["fee.depositInvoice"],
      tiffin_billing: t["fee.tiffin"],
      appointment_checkout_at_counter: t["fee.appointmentCheckout"],
      payments_recorded_by_hand: t["fee.manual"],
      card_processing: "Stripe's standard rate, passed through at cost, on top",
      loyalty: "no fee on loyalty, ever",
    };
  if (want("founding_offer")) {
    const corridors = await foundingCorridors(ctx).catch(() => ({ corridors: [] as { name: string; taken: number; total: number }[] }));
    const after = (c: number, pct: number) => fmt(Math.round((c * (100 - pct)) / 100));
    out.founding_offer = {
      terms: `First ${FOUNDING_OFFER.slotsPerCorridor} restaurants per corridor: ${FOUNDING_OFFER.firstYearPct}% off for 12 months, then ${FOUNDING_OFFER.lifetimePct}% off for life. Only while spots last: the team confirms a spot; do not promise one.`,
      price_examples: RESTAURANT_TIERS.map((k) => ({ tier: RESTAURANT_PLANS[k].name, first_12_months_monthly: after(RESTAURANT_PLANS[k].priceCents, FOUNDING_OFFER.firstYearPct), then_monthly: after(RESTAURANT_PLANS[k].priceCents, FOUNDING_OFFER.lifetimePct) })),
      corridors: corridors.corridors.map((c) => ({ name: c.name, spots_taken: c.taken, spots_total: c.total })),
    };
  }
  return out;
}

export async function getNetworkStats(ctx: AppContext): Promise<unknown> {
  const { network } = await publicPlans(ctx);
  return { ...network, quotable: network.activeMerchants >= LIVE_PROOF_MIN_SHOPS, note: network.activeMerchants >= LIVE_PROOF_MIN_SHOPS ? "Live counts." : "Too few shops for counts to mean anything: do not quote these numbers." };
}

export function knowledgeSearch(query: string, source: string | null): unknown {
  const sources: KnowledgeSource[] | null = source === "faq" ? ["faq"] : source === "legal" ? ["terms", "privacy", "merchant_agreement", "rewards"] : null;
  const hits = searchKnowledge(query, sources, 4);
  if (!hits.length) return { results: [], note: "Nothing found. Do not guess: say you will check with the team and call escalate_to_human." };
  return { results: hits.map((h) => ({ source: SOURCE_LABEL[h.source], section: h.title, draft_legal_text: h.draft, text: h.text })) };
}

// ---------------------------------------------------------------------------
// Verified owner
// ---------------------------------------------------------------------------
export interface OwnedShop {
  number: number;
  id: string;
  name: string;
  status: string;
  plan: string;
  restaurantTier: string | null;
  foundingOffer: boolean;
}

export const isVerified = (conv: Conv, now: Date): boolean => !!conv.verifiedAt && !!conv.verifiedUserId && now.getTime() - conv.verifiedAt.getTime() < VERIFY_TTL_MS;

/** The shops the verified user owns (not just staffs), oldest first, numbered from 1. */
export async function ownedShops(ctx: AppContext, conv: Conv): Promise<OwnedShop[]> {
  if (!isVerified(conv, ctx.now())) return [];
  const rows = await ctx.db
    .select({ id: merchants.id, name: merchants.name, status: merchants.status, plan: merchants.plan, restaurantTier: merchants.restaurantTier, foundingOffer: merchants.foundingOffer })
    .from(merchantStaff)
    .innerJoin(merchants, eq(merchants.id, merchantStaff.merchantId))
    .where(and(eq(merchantStaff.userId, conv.verifiedUserId!), eq(merchantStaff.role, "owner"), ne(merchants.status, "closed")))
    .orderBy(asc(merchants.createdAt), asc(merchants.id));
  return rows.map((r, i) => ({ number: i + 1, ...r, restaurantTier: r.restaurantTier ?? null }));
}

/** The code goes out only to a number that belongs to an owner, and the answer is the same either way (no probing which numbers have shops, no texts to arbitrary numbers). */
async function requestVerification(c: Ctx, phoneRaw: unknown): Promise<ToolRun> {
  const { ctx, conv } = c;
  const phone = typeof phoneRaw === "string" ? normalizePhone(phoneRaw) : null;
  if (!phone) return { ok: false, data: { error: "That does not look like a phone number. Ask for the owner's 10-digit mobile number." }, summary: "invalid phone", conv };
  if (!(await allow(ctx, `agent:otp:${conv.id}`, 3, 3_600_000)) || !(await allow(ctx, `agent:otp-phone:${phone}`, 3, 3_600_000))) return { ok: false, data: { error: "Too many codes requested. Ask the person to try again later, or hand off to a person." }, summary: "otp rate limited", conv };
  const [owner] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(merchantStaff, eq(merchantStaff.userId, users.id))
    .where(and(eq(users.phone, phone), eq(merchantStaff.role, "owner")))
    .limit(1);
  if (owner) await startAgentVerification(ctx, phone, c.lang);
  // Whether or not we sent, the chat waits for a code, and a wrong or missing one fails the same way.
  const next = await updateConversation(ctx, conv.id, { otpPhone: phone, otpSentAt: ctx.now(), phone: conv.phone ?? phone });
  return { ok: true, data: { status: "code_requested", message: "If that number belongs to a shop owner, a 6-digit code was texted to it. Ask the person to type just the code here." }, summary: "verification code requested", conv: next };
}

async function myAccount(c: Ctx): Promise<ToolRun> {
  const { ctx, conv } = c;
  if (!isVerified(conv, ctx.now())) return { ok: false, data: { error: "not_verified", message: "Account details need a phone check first. Offer request_phone_verification." }, summary: "not verified", conv };
  const shops = await ownedShops(ctx, conv);
  const out = [];
  for (const s of shops) {
    const subs = await ctx.db.select().from(subscriptions).where(eq(subscriptions.merchantId, s.id)).orderBy(desc(subscriptions.createdAt)).limit(3);
    out.push({
      number: s.number,
      name: s.name,
      status: s.status,
      plan: PLANS[s.plan as keyof typeof PLANS]?.name ?? s.plan,
      restaurant_plan: s.restaurantTier ? RESTAURANT_PLANS[s.restaurantTier as RestaurantTier].name : null,
      founding_offer: s.foundingOffer,
      subscriptions: subs.map((x) => ({ product: x.restaurantTier ? RESTAURANT_PLANS[x.restaurantTier].name : PLANS[x.plan].name, status: x.status, billed: x.interval === "year" ? "yearly" : "monthly", renews_or_ends: x.currentPeriodEnd?.toISOString().slice(0, 10) ?? null, cancels_at_period_end: x.cancelAtPeriodEnd })),
    });
  }
  return { ok: true, data: { shops: out, note: out.length ? undefined : "This number owns no shop yet. Offer start_signup." }, summary: `account: ${out.length} shop(s)`, conv };
}

// ---------------------------------------------------------------------------
// Confirmed actions
// ---------------------------------------------------------------------------
type Executor = (c: Ctx, args: Record<string, unknown>) => Promise<{ ok: boolean; data: unknown; summary: string; conv?: Conv }>;

interface ActionSpec {
  /** Validate the arguments and describe what will happen, in plain English for the model to translate. Throws a string for the model to fix. */
  prepare: (c: Ctx, args: Record<string, unknown>) => Promise<{ args: Record<string, unknown>; summary: string }>;
  run: Executor;
}

const need = (msg: string): never => {
  throw new ToolInputError(msg);
};
export class ToolInputError extends Error {}

const contactOk = (phone: string | null, email: string | null) => (phone || email ? null : "Ask for a phone number or an email first: the team needs one way to reach them.");
const emailOf = (v: unknown) => {
  const e = str(v, 200);
  return e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
};
const phoneOf = (v: unknown) => {
  const p = str(v, 40);
  return p ? normalizePhone(p) : null;
};

/** The lead's language field is the reps' four (rep.ts); a French chat has no field value, so the note names it and the rep reads it there. */
function leadLanguage(lang: AgentLang): "en" | "hi" | "ur" | "pa" | undefined {
  return lang === "fr" ? undefined : lang;
}
const leadNote = (channel: string, lang: AgentLang) => `[sales assistant, ${channel}${lang === "fr" ? ", speaks French (Quebec): reply in French" : ""}]`;

const ACTIONS: Record<string, ActionSpec> = {
  create_lead: {
    async prepare(c, a) {
      const business = str(a.business_name, 160) ?? need("business_name is required.");
      const phone = phoneOf(a.phone);
      const email = emailOf(a.email);
      const problem = contactOk(phone, email);
      if (problem) need(problem);
      const args = { business_name: business, contact_name: str(a.contact_name, 120), phone, email, vertical: str(a.vertical, 40), notes: str(a.notes, 600) };
      return { args, summary: `Save ${business} as a lead so the team can reach out${phone ? ` by phone (${maskPhone(phone)})` : ""}${email ? " by email" : ""}. No sign-up and no charge.` };
    },
    async run(c, a) {
      const { ctx, conv } = c;
      const res = await createPublicLead(
        ctx,
        {
          businessName: a.business_name as string,
          contactName: (a.contact_name as string | null) ?? undefined,
          phone: (a.phone as string | null) ?? undefined,
          email: (a.email as string | null) ?? undefined,
          vertical: (a.vertical as string | null) ?? undefined,
          message: [leadNote(conv.channel, c.lang), a.notes as string | null, `Conversation ${conv.id}`].filter(Boolean).join("\n"),
          kind: "talk_to_us",
          language: leadLanguage(c.lang),
        },
        `agent:${conv.id}`,
      );
      const next = await updateConversation(ctx, conv.id, { leadId: res.id });
      return { ok: true, data: { status: "saved", message: "Saved. The team will reach out. Say what happens next without promising a time." }, summary: "lead created", conv: next };
    },
  },
  start_signup: {
    async prepare(c, a) {
      const kind = a.kind === "restaurant" ? "restaurant" : "shop";
      const business = str(a.business_name, 160);
      return { args: { kind, business_name: business, phone: phoneOf(a.phone), plan_interest: str(a.plan_interest, 60) }, summary: `Send a sign-up link for a ${kind}${business ? ` (${business})` : ""}, pre-filled with what you told me. Signing up is free; nothing is charged by clicking it.` };
    },
    async run(c, a) {
      const { ctx, conv } = c;
      const q = new URLSearchParams({ ref: "assistant" });
      if (a.business_name) q.set("shop", a.business_name as string);
      if (a.kind === "restaurant") q.set("vertical", "restaurant");
      if (a.phone) q.set("phone", a.phone as string);
      if (a.plan_interest) q.set("plan", a.plan_interest as string);
      const url = `${ctx.config.publicWebUrl.replace(/\/$/, "")}/signup?${q.toString()}`;
      await writeAudit(ctx.db, { actorUserId: null, action: "sales_agent.signup_link", entity: "sales_agent_conversation", entityId: conv.id, data: { kind: a.kind } });
      return { ok: true, data: { status: "link_ready", url, message: "Give the person this exact link. Sign-up takes about 2 minutes." }, summary: "sign-up link sent" };
    },
  },
  request_founder_call: {
    async prepare(c, a) {
      const when = str(a.preferred_time_text, 200) ?? need("preferred_time_text is required.");
      const phone = phoneOf(a.phone) ?? (c.conv.channel === "whatsapp" ? c.conv.phone : null);
      const email = emailOf(a.email);
      const problem = contactOk(phone, email);
      if (problem) need(problem);
      let iso: string | null = null;
      const raw = str(a.preferred_time_iso, 40);
      if (raw && !Number.isNaN(Date.parse(raw))) {
        if (Date.parse(raw) <= c.ctx.now().getTime()) need("That time is in the past. Ask for a time in the future.");
        iso = new Date(raw).toISOString();
      }
      const args = { when, iso, business_name: str(a.business_name, 160), contact_name: str(a.contact_name, 120), phone, email, topic: str(a.topic, 300) };
      return { args, summary: `Request a call with the founder: ${when}. This is a request, not a booking; the team will confirm a time with you${phone ? ` at ${maskPhone(phone)}` : ""}.` };
    },
    async run(c, a) {
      const { ctx, conv } = c;
      const res = await createPublicLead(
        ctx,
        {
          businessName: (a.business_name as string | null) ?? "Unknown (chat)",
          contactName: (a.contact_name as string | null) ?? undefined,
          phone: (a.phone as string | null) ?? undefined,
          email: (a.email as string | null) ?? undefined,
          message: [`[founder call requested via the sales assistant${c.lang === "fr" ? "; speaks French (Quebec): reply in French" : ""}]`, `Preferred time: ${a.when as string}${a.iso ? ` (${a.iso as string})` : ""}`, a.topic as string | null, `Conversation ${conv.id}`].filter(Boolean).join("\n"),
          kind: "talk_to_us",
          language: leadLanguage(c.lang),
        },
        `agent:${conv.id}`,
      );
      const next = await updateConversation(ctx, conv.id, { leadId: conv.leadId ?? res.id, callRequestAt: a.iso ? new Date(a.iso as string) : null, callRequestNote: `Requested: ${a.when as string}${a.topic ? ` | ${a.topic as string}` : ""}`.slice(0, 500) });
      await writeAudit(ctx.db, { actorUserId: null, action: "sales_agent.call_requested", entity: "sales_agent_conversation", entityId: conv.id, data: { hasIso: !!a.iso } });
      await notifyTeam(ctx, "Founder call requested (sales assistant)", [`Preferred time: ${a.when as string}${a.iso ? ` (${a.iso as string})` : ""}`, a.business_name ? `Business: ${a.business_name as string}` : null, a.phone ? `Phone: ${maskPhone(a.phone as string)}` : null, `Chat: ${consoleLink(ctx, conv.id)}`].filter(Boolean).join("\n"));
      return { ok: true, data: { status: "requested", message: "Requested, not booked. The team will confirm a time. Do not say it is booked." }, summary: "founder call requested", conv: next };
    },
  },
  create_checkout_link: {
    async prepare(c, a) {
      if (!isVerified(c.conv, c.ctx.now())) need("The person must verify their phone first (request_phone_verification), then type the code.");
      const shops = await ownedShops(c.ctx, c.conv);
      if (!shops.length) need("This number owns no shop. Offer start_signup instead.");
      const n = typeof a.shop_number === "number" ? a.shop_number : shops.length === 1 ? 1 : need("Ask which shop (give the # from get_my_account).");
      const shop = shops.find((s) => s.number === n) ?? need("No such shop number for this owner.");
      const interval = a.interval === "year" ? "year" : "month";
      if (a.product === "restaurant_plan") {
        const tier = RESTAURANT_TIERS.find((t) => t === a.tier) ?? need("tier (starter, growth or pro) is required for a restaurant plan.");
        return { args: { shopId: shop.id, product: "restaurant_plan", tier, interval }, summary: `Create a checkout link for ${RESTAURANT_PLANS[tier].name} (${interval === "year" ? "yearly" : "monthly"}) for ${shop.name}. You pay on Stripe's page; nothing is charged until you complete it.` };
      }
      const plan = a.plan === "plus" || a.plan === "pro" ? a.plan : need("plan (plus or pro) is required for a shop plan.");
      return { args: { shopId: shop.id, product: "shop_plan", plan, interval }, summary: `Create a checkout link for ${PLANS[plan].name} (${interval === "year" ? "yearly" : "monthly"}) for ${shop.name}. You pay on Stripe's page; nothing is charged until you complete it.` };
    },
    async run(c, a) {
      const { ctx, conv } = c;
      // Re-check at execution: still verified, and the shop is still one this owner owns.
      if (!isVerified(conv, ctx.now())) return { ok: false, data: { error: "verification_expired", message: "The phone check has expired. Ask them to verify again." }, summary: "verification expired" };
      const shops = await ownedShops(ctx, conv);
      const shop = shops.find((s) => s.id === a.shopId);
      if (!shop) return { ok: false, data: { error: "not_your_shop" }, summary: "shop not owned" };
      const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, shop.id)).limit(1);
      if (!merchant) return { ok: false, data: { error: "not_your_shop" }, summary: "shop missing" };
      try {
        const interval = a.interval === "year" ? "year" : "month";
        const res = a.product === "restaurant_plan" ? await startRestaurantCheckout(ctx, merchant, { tier: a.tier as RestaurantTier, interval }) : await startCheckout(ctx, merchant, { plan: a.plan as "plus" | "studio" | "pro", interval });
        await writeAudit(ctx.db, { actorUserId: conv.verifiedUserId, merchantId: merchant.id, action: "sales_agent.checkout_link", entity: "sales_agent_conversation", entityId: conv.id, data: { product: a.product, tier: a.tier ?? a.plan, interval } });
        return { ok: true, data: { status: "link_ready", url: res.url, message: "Give the person this exact link. They pay on Stripe's page." }, summary: `checkout link (${String(a.tier ?? a.plan)}, ${String(a.interval)})` };
      } catch (err) {
        if (err instanceof HttpError) return { ok: false, data: { error: err.code, message: err.message, tell_the_person: err.statusCode === 402 ? "That plan is not open to every shop yet; the team can tell them when it opens." : err.message }, summary: `checkout refused (${err.code})` };
        throw err;
      }
    },
  },
};

async function runAction(c: Ctx, name: string, args: Record<string, unknown>): Promise<ToolRun> {
  const { ctx, conv } = c;
  const spec = ACTIONS[name]!;
  const confirmationId = str(args.confirmation_id, 80);
  if (!confirmationId) {
    let prepared;
    try {
      prepared = await spec.prepare(c, args);
    } catch (err) {
      if (err instanceof ToolInputError) return { ok: false, data: { error: "invalid_input", message: err.message }, summary: `not ready: ${err.message.slice(0, 80)}`, conv };
      throw err;
    }
    const id = `c_${randomToken(8)}`;
    const next = await updateConversation(ctx, conv.id, { pendingAction: { id, tool: name, args: prepared.args, turn: conv.turn, summary: prepared.summary } });
    return { ok: true, data: { status: "needs_confirmation", confirmation_id: id, summary: prepared.summary, instruction: "Show this summary to the person in their language, ask a clear yes or no, and stop. Do not call this tool again until they answer in a new message." }, summary: `awaiting confirmation: ${name}`, conv: next };
  }
  const p = conv.pendingAction;
  if (!p || p.id !== confirmationId || p.tool !== name) return { ok: false, data: { error: "no_such_confirmation", message: "There is nothing waiting with that id. Start again without a confirmation_id." }, summary: "bad confirmation id", conv };
  if (conv.turn <= p.turn) return { ok: false, data: { error: "not_confirmed_yet", message: "The person has not replied since the summary was shown. Show the summary, ask yes or no, and wait for their next message." }, summary: "confirmation attempted in the same turn", conv };
  const cleared = await updateConversation(ctx, conv.id, { pendingAction: null });
  const r = await spec.run({ ...c, conv: cleared }, p.args);
  return { ok: r.ok, data: r.data, summary: r.summary, conv: r.conv ?? cleared };
}

/** Run one tool call. Never throws for bad model input; unexpected errors become a generic tool error (details stay out of the transcript). */
export async function runTool(ctx: AppContext, conv: Conv, lang: AgentLang, name: string, input: unknown): Promise<ToolRun> {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const c: Ctx = { ctx, conv, lang };
  try {
    switch (name) {
      case "get_pricing":
        return { ok: true, data: await getPricing(ctx, str(args.topic, 30)), summary: `pricing: ${str(args.topic, 30) ?? "all"}`, conv };
      case "search_knowledge": {
        const q = str(args.query, 200);
        if (!q) return { ok: false, data: { error: "query is required" }, summary: "empty query", conv };
        const data = knowledgeSearch(q, str(args.source, 10)) as { results: unknown[] };
        return { ok: true, data, summary: `knowledge: ${data.results.length} hit(s)`, conv };
      }
      case "get_network_stats":
        return { ok: true, data: await getNetworkStats(ctx), summary: "network stats", conv };
      case "request_phone_verification":
        return await requestVerification(c, args.phone);
      case "get_my_account":
        return await myAccount(c);
      case "escalate_to_human": {
        const reason = str(args.reason, 300) ?? "The assistant asked for a person.";
        const next = await escalate(ctx, conv, reason);
        return { ok: true, data: { status: "handed_off", message: "A person will reply in this chat. Tell the person that, in their language, in one sentence." }, summary: "escalated", conv: next };
      }
      case "create_lead":
      case "start_signup":
      case "request_founder_call":
      case "create_checkout_link":
        return await runAction(c, name, args);
      default:
        return { ok: false, data: { error: `unknown tool ${name}` }, summary: "unknown tool", conv };
    }
  } catch (err) {
    if (ctx.config.env !== "test") console.error("[sales-agent] tool error", name, (err as Error).name);
    return { ok: false, data: { error: "tool_failed", message: "That did not work. Say you will check with the team and call escalate_to_human." }, summary: `error: ${(err as Error).name}`, conv };
  }
}

/** The masked input recorded for the admin transcript. */
export const logInput = (input: unknown): Record<string, unknown> => {
  const masked = maskValue(input);
  return masked && typeof masked === "object" && !Array.isArray(masked) ? (masked as Record<string, unknown>) : {};
};
