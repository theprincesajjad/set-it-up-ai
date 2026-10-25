/**
 * Phone ordering assistant, minimal (restaurant.phone_ai, Pro).
 *
 * A telephony provider (Twilio-style) posts to /v1/webhooks/phone/:merchantId:
 *  - first request, no speech yet: we answer with a <Gather> so the caller can say their order;
 *  - request with SpeechResult / TranscriptionText: we store the call, parse the transcript
 *    into a draft order and say thanks.
 * Staff list calls, confirm a draft into a real order (channel "phone") or discard it.
 *
 * The parser (`parseTranscript`) is pure: it matches menu item names and their
 * translations (hi/ur/pa), reads quantities and a pickup hint. No live AI dependency.
 */
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { catalogItems, merchants, orders, phoneCalls } from "@ll/db";
import { whatsappApi } from "@ll/shared";
import type { AppContext } from "../context.js";
import { HttpError, badRequest, conflict, notFound } from "../lib/errors.js";
import { extractOrderLines, type MenuMatchItem, type ParsedOrder } from "../lib/menu-match.js";
import { placeChannelOrder, normalizePhone } from "./channel-orders.js";
import { decodeCursor, encodeCursor } from "./commerceShared.js";
import { isFeatureOn, requireFeature } from "./features.js";
import { memberByPhone, usualFor } from "./usual.js";

type Merchant = typeof merchants.$inferSelect;
type Call = typeof phoneCalls.$inferSelect;
type DraftAmbiguous = { phrase: string; quantity?: number; options: ({ catalogItemId: string; name: string } | string)[] };
type Draft = NonNullable<Call["draftOrder"]> & { unmatched?: string[]; ambiguous?: DraftAmbiguous[] };

/** Matches below this score are flagged for a look before confirming. */
const SURE_SCORE = 0.9;

/** Pure: transcript + menu -> draft order. `now` anchors "in 30 minutes". */
export function parseTranscript(transcript: string, menu: MenuMatchItem[], now: Date): { draft: Draft; parsed: ParsedOrder } {
  const parsed = extractOrderLines(transcript, menu);
  const draft: Draft = {
    items: parsed.lines.map((l) => ({ catalogItemId: l.catalogItemId, name: l.name, quantity: l.quantity, ...(l.score < SURE_SCORE ? { uncertain: true } : {}) })),
    ...(parsed.pickupInMinutes ? { pickupAt: new Date(now.getTime() + parsed.pickupInMinutes * 60_000).toISOString() } : {}),
    ...(parsed.pickupNote ? { notes: parsed.pickupNote } : {}),
    unmatched: parsed.unmatched,
    ambiguous: parsed.ambiguous.map((a) => ({ phrase: a.phrase, quantity: a.quantity, options: a.options })),
  };
  return { draft, parsed };
}

/** "en-US" / "hi-IN" / "ur-PK" / "pa-guru-IN" -> en | hi | ur | pa. */
export function languageFromCode(code: string | undefined | null): "en" | "hi" | "ur" | "pa" | null {
  const c = (code ?? "").slice(0, 2).toLowerCase();
  return c === "en" || c === "hi" || c === "ur" || c === "pa" ? c : null;
}

const SPEECH_LANG: Record<string, string> = { en: "en-CA", fr: "fr-CA", hi: "hi-IN", ur: "ur-PK", pa: "pa-guru-IN" };
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/**
 * Spoken before the caller says anything: the call is turned into text and the text is kept (phone_calls.transcript),
 * so the caller must be told (PIPEDA openness and consent; Quebec Law 25, which needs French). English, French (fr-CA), Hindi,
 * Urdu and Punjabi, the shop's own language first. French is the notice only: callers still order in the shop's four languages.
 * Wording to be checked by a native speaker of each language before launch (the French is listed in docs/legal/counsel-notes.md).
 */
export const TRANSCRIPT_NOTICE: Record<"en" | "fr" | "hi" | "ur" | "pa", string> = {
  en: "This call is turned into text by an automated assistant, and the text is saved so the shop can prepare your order. If you do not want this, please hang up.",
  fr: "Cet appel est converti en texte par un assistant automatisé, et le texte est conservé afin que la boutique puisse préparer votre commande. Si vous ne le souhaitez pas, veuillez raccrocher.",
  hi: "यह कॉल एक स्वचालित सहायक द्वारा टेक्स्ट में बदली जाती है, और आपका ऑर्डर तैयार करने के लिए वह टेक्स्ट सहेजा जाता है। यदि आप ऐसा नहीं चाहते, तो कृपया फ़ोन रख दें।",
  ur: "یہ کال ایک خودکار معاون کے ذریعے متن میں تبدیل کی جاتی ہے، اور آپ کا آرڈر تیار کرنے کے لیے وہ متن محفوظ کیا جاتا ہے۔ اگر آپ یہ نہیں چاہتے تو براہِ کرم فون بند کر دیں۔",
  pa: "ਇਹ ਕਾਲ ਇੱਕ ਆਟੋਮੈਟਿਕ ਸਹਾਇਕ ਦੁਆਰਾ ਟੈਕਸਟ ਵਿੱਚ ਬਦਲੀ ਜਾਂਦੀ ਹੈ, ਅਤੇ ਤੁਹਾਡਾ ਆਰਡਰ ਤਿਆਰ ਕਰਨ ਲਈ ਉਹ ਟੈਕਸਟ ਸੰਭਾਲਿਆ ਜਾਂਦਾ ਹੈ। ਜੇ ਤੁਸੀਂ ਇਹ ਨਹੀਂ ਚਾਹੁੰਦੇ, ਤਾਂ ਕਿਰਪਾ ਕਰਕੇ ਫ਼ੋਨ ਰੱਖ ਦਿਓ।",
};

/** The notice in every language, `first` leading, each as a <Say> tagged with its own language. */
export function noticeSays(first: "en" | "hi" | "ur" | "pa"): string {
  const order = [first, ...(["en", "fr", "hi", "ur", "pa"] as const).filter((l) => l !== first)];
  return order.map((l) => `<Say language="${SPEECH_LANG[l]}">${esc(TRANSCRIPT_NOTICE[l])}</Say>`).join("");
}

/** TwiML: ask for the order (Gather posts back to `action`), or just say something. `notices` are extra <Say> spoken first. */
export function voiceResponse(opts: { say: string; gatherAction?: string; language?: string; notices?: string }): string {
  const say = `<Say>${esc(opts.say)}</Say>`;
  // Notices sit before the <Gather>, not inside it, so the caller talking over the prompt cannot skip them.
  const inner = (opts.notices ?? "") + (opts.gatherAction ? `<Gather input="speech" action="${esc(opts.gatherAction)}" method="POST" speechTimeout="auto" language="${esc(opts.language ?? "en-CA")}">${say}</Gather>` : say);
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}${opts.gatherAction ? "" : "<Hangup/>"}</Response>`;
}

async function menuFor(ctx: AppContext, merchantId: string): Promise<(MenuMatchItem & { priceCents: number })[]> {
  const rows = await ctx.db.select().from(catalogItems).where(and(eq(catalogItems.merchantId, merchantId), eq(catalogItems.available, true), eq(catalogItems.orderable, true)));
  return rows.map((r) => ({ id: r.id, name: r.name, translations: r.translations, priceCents: r.priceCents }));
}

export function callDto(c: Call): whatsappApi.PhoneCallDto {
  const d = c.draftOrder as Draft | null;
  return {
    id: c.id,
    fromPhone: c.fromPhone,
    language: c.language,
    transcript: c.transcript,
    draftOrder: d ? { items: d.items, ...(d.pickupAt ? { pickupAt: d.pickupAt } : {}), ...(d.notes ? { notes: d.notes } : {}) } : null,
    unmatched: d?.unmatched ?? [],
    // Calls saved before options carried ids hold plain names: the screen matches those against the menu.
    ambiguous: (d?.ambiguous ?? []).map((a) => ({ phrase: a.phrase, quantity: a.quantity ?? 1, options: a.options.map((o) => (typeof o === "string" ? { catalogItemId: "", name: o } : o)) })),
    orderId: c.orderId,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
  };
}

const formatPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : p;
};

/** Add who is calling, their usual and what we understood (English, built from the draft, not a translation of the audio). */
async function enrich(ctx: AppContext, merchant: Merchant, calls: Call[]): Promise<whatsappApi.PhoneCallDto[]> {
  const tz = merchant.timezone;
  const nums = [...new Set(calls.map((c) => c.orderId).filter((x): x is string => !!x))];
  const numbers = new Map<string, number>();
  if (nums.length) for (const o of await ctx.db.select({ id: orders.id, number: orders.number }).from(orders).where(inArray(orders.id, nums))) numbers.set(o.id, o.number);
  const members = new Map<string, Awaited<ReturnType<typeof memberByPhone>>>();
  const usuals = new Map<string, string | null>();
  const out: whatsappApi.PhoneCallDto[] = [];
  for (const c of calls) {
    if (!members.has(c.fromPhone)) {
      const m = await memberByPhone(ctx.db, merchant.id, c.fromPhone);
      members.set(c.fromPhone, m);
      usuals.set(c.fromPhone, m ? ((await usualFor(ctx.db, merchant.id, m.userId, ctx.now()))?.text ?? null) : null);
    }
    const m = members.get(c.fromPhone) ?? null;
    const dto = callDto(c);
    const d = c.draftOrder as Draft | null;
    const parts = (d?.items ?? []).map((i) => `${i.quantity} × ${i.name}`);
    for (const a of dto.ambiguous) parts.push(`${a.quantity} × ${a.phrase} (which one?)`);
    const when = d?.pickupAt ? `pickup ${new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(d.pickupAt)).replace(/\u202f/g, " ").toLowerCase().replace(/\./g, "")}` : d?.notes ?? null;
    out.push({
      ...dto,
      orderNumber: c.orderId ? (numbers.get(c.orderId) ?? null) : null,
      callerName: m?.name ?? null,
      member: m ? { id: m.memberId, name: m.name, visits: m.visits } : null,
      usualText: usuals.get(c.fromPhone) ?? null,
      understood: parts.length ? [parts.join(", "), when].filter(Boolean).join(" · ") : null,
    });
  }
  return out;
}

export interface IncomingCall {
  callSid: string;
  from: string;
  transcript: string | null;
  languageCode: string | null;
}

/** Webhook body (Twilio field names) -> IncomingCall. Also accepts a JSON { transcript } for other providers. */
export function readCallParams(p: Record<string, unknown>): IncomingCall {
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string).trim() : "");
  const transcript = s("SpeechResult") || s("TranscriptionText") || s("Transcript") || s("transcript") || null;
  return {
    callSid: s("CallSid") || s("callSid") || `call_${Date.now()}`,
    from: s("From") || s("from"),
    transcript,
    languageCode: s("Language") || s("LanguageCode") || s("SpeechLanguage") || s("language") || null,
  };
}

/** Store (or update) a call and parse its transcript. Returns the TwiML to answer with. */
export async function ingestCall(ctx: AppContext, merchant: Merchant, call: IncomingCall, selfUrl: string): Promise<{ xml: string; row: Call | null }> {
  const enabled = await isFeatureOn(ctx.db, merchant, "restaurant.phone_ai");
  if (!enabled) return { xml: voiceResponse({ say: `Thanks for calling ${merchant.name}. Please call back during business hours to place your order.` }), row: null };
  const lang = languageFromCode(call.languageCode) ?? (merchant.languages[0] as "en" | "hi" | "ur" | "pa" | undefined) ?? "en";
  if (!call.transcript) {
    return { xml: voiceResponse({ say: `Thanks for calling ${merchant.name}. After the tone, tell us what you would like to order and a time for pickup.`, gatherAction: selfUrl, language: SPEECH_LANG[lang], notices: noticeSays(lang) }), row: null };
  }
  const menu = await menuFor(ctx, merchant.id);
  const { draft } = parseTranscript(call.transcript, menu, ctx.now());
  const status = draft.items.length ? "drafted" : "received";
  const [existing] = await ctx.db.select().from(phoneCalls).where(and(eq(phoneCalls.merchantId, merchant.id), eq(phoneCalls.providerCallId, call.callSid))).limit(1);
  let row: Call;
  if (existing) {
    // A later transcript for the same call replaces the draft unless staff already acted on it.
    if (existing.status === "confirmed" || existing.status === "discarded") return { xml: voiceResponse({ say: "Thank you. Your order is being prepared." }), row: existing };
    row = (await ctx.db.update(phoneCalls).set({ transcript: call.transcript, draftOrder: draft, language: lang, status }).where(eq(phoneCalls.id, existing.id)).returning())[0]!;
  } else {
    row = (
      await ctx.db
        .insert(phoneCalls)
        .values({ merchantId: merchant.id, fromPhone: normalizePhone(call.from || "0000000000"), language: lang, transcript: call.transcript, draftOrder: draft, status, providerCallId: call.callSid, createdAt: ctx.now() })
        .returning()
    )[0]!;
  }
  const say = draft.items.length
    ? `Thank you. We heard ${draft.items.map((i) => `${i.quantity} ${i.name}`).join(", ")}. ${merchant.name} will confirm your order shortly.`
    : `Thank you. ${merchant.name} will call you back to confirm your order.`;
  return { xml: voiceResponse({ say }), row };
}

// ---------------------------------------------------------------------------
// Merchant endpoints
// ---------------------------------------------------------------------------
export async function listCalls(ctx: AppContext, merchant: Merchant, q: { status?: string; limit: number; cursor?: string }) {
  await requireFeature(ctx.db, merchant, "restaurant.phone_ai");
  const c = decodeCursor(q.cursor);
  const rows = await ctx.db
    .select()
    .from(phoneCalls)
    .where(
      and(
        eq(phoneCalls.merchantId, merchant.id),
        q.status ? eq(phoneCalls.status, q.status) : undefined,
        c ? or(lt(phoneCalls.createdAt, c.createdAt), and(eq(phoneCalls.createdAt, c.createdAt), lt(phoneCalls.id, c.id))) : undefined,
      ),
    )
    .orderBy(desc(phoneCalls.createdAt), desc(phoneCalls.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return { items: await enrich(ctx, merchant, page), nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null };
}

async function loadCall(ctx: AppContext, merchantId: string, id: string): Promise<Call> {
  const [c] = await ctx.db.select().from(phoneCalls).where(and(eq(phoneCalls.merchantId, merchantId), eq(phoneCalls.id, id))).limit(1);
  if (!c) throw notFound("Call");
  return c;
}

export async function getCall(ctx: AppContext, merchant: Merchant, id: string) {
  await requireFeature(ctx.db, merchant, "restaurant.phone_ai");
  return (await enrich(ctx, merchant, [await loadCall(ctx, merchant.id, id)]))[0]!;
}

export async function confirmCall(ctx: AppContext, merchant: Merchant, id: string, input: whatsappApi.ConfirmCallBody) {
  await requireFeature(ctx.db, merchant, "restaurant.phone_ai");
  const body = whatsappApi.confirmCallBody.parse(input);
  const call = await loadCall(ctx, merchant.id, id);
  if (call.status === "confirmed") throw conflict("This call was already confirmed");
  if (call.status === "discarded") throw conflict("This call was discarded");
  const draft = call.draftOrder as Draft | null;
  // Confirming the draft as it stands needs every uncertain item settled first; staff who send their own item list have checked it.
  if (!body.items && ((draft?.ambiguous?.length ?? 0) > 0 || (draft?.items ?? []).some((i) => (i as { uncertain?: boolean }).uncertain))) {
    throw new HttpError(409, "call_needs_review", "Check the item the assistant wasn't sure about before confirming this order.");
  }
  const lines = (body.items ?? draft?.items ?? []).filter((i): i is { catalogItemId: string; name: string; quantity: number } => !!i.catalogItemId);
  if (!lines.length) throw badRequest("There are no matched items to order. Add items from the menu first.");
  const pickup = body.pickupAt ?? draft?.pickupAt;
  // The note names the caller (member name, else their number). The provider's call id stays internal.
  const member = await memberByPhone(ctx.db, merchant.id, call.fromPhone);
  const caller = member?.name?.trim() || formatPhone(call.fromPhone);
  try {
    const res = await placeChannelOrder(ctx, merchant, {
      phone: call.fromPhone,
      channel: "phone",
      lines,
      paymentMethod: body.paymentMethod,
      locationId: body.locationId,
      pickupAt: pickup ? new Date(pickup) : null,
      notes: [body.notes ?? draft?.notes, `Phone order · ${caller}`].filter(Boolean).join(" | ").slice(0, 500),
      tipCents: body.tipCents,
      idempotencyKey: `phone:${call.id}`,
    });
    const [updated] = await ctx.db.update(phoneCalls).set({ status: "confirmed", orderId: res.order.id }).where(eq(phoneCalls.id, call.id)).returning();
    return { call: { ...callDto(updated!), orderNumber: res.order.number, callerName: member?.name ?? null }, order: res.order };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    await ctx.db.update(phoneCalls).set({ status: "failed" }).where(eq(phoneCalls.id, call.id));
    throw err;
  }
}

export async function discardCall(ctx: AppContext, merchant: Merchant, id: string) {
  await requireFeature(ctx.db, merchant, "restaurant.phone_ai");
  const call = await loadCall(ctx, merchant.id, id);
  if (call.status === "confirmed") throw conflict("This call already became an order");
  const [u] = await ctx.db.update(phoneCalls).set({ status: "discarded" }).where(eq(phoneCalls.id, call.id)).returning();
  return callDto(u!);
}
