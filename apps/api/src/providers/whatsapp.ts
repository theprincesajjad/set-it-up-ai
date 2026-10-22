/**
 * WhatsApp Cloud API (Meta Graph) provider: send template, send text, webhook
 * verification (hub.challenge) and payload signature check (X-Hub-Signature-256).
 *
 *  - MetaWhatsApp (below): used when WHATSAPP_ACCESS_TOKEN is set.
 *  - FakeWhatsApp (providers/whatsappFake.ts): records sends; used in dev/test.
 *
 * Use `getWhatsApp(ctx)`; never construct a provider in a route.
 * Free-form text is only allowed inside the 24 hour customer-service window;
 * outside it, send an approved template (services/whatsapp.ts enforces this).
 */
import { createHmac } from "node:crypto";
import type { Config } from "../config.js";
import type { AppContext } from "../context.js";
import { safeEqual } from "../lib/crypto.js";
import { FakeWhatsApp } from "./whatsappFake.js";

export type Fetch = typeof fetch;

export interface WhatsAppTemplateSend {
  /** Meta phone number id of the sending business number. */
  phoneNumberId: string;
  /** Recipient in E.164 (with or without +). */
  to: string;
  template: string;
  /** en | hi | ur | pa (mapped to Meta language codes). */
  language: string;
  /** Body variables in order ({{1}}, {{2}}, ...). */
  params: string[];
}

export interface WhatsAppTextSend {
  phoneNumberId: string;
  to: string;
  body: string;
}

export interface WhatsAppProvider {
  name: string;
  sendTemplate(msg: WhatsAppTemplateSend): Promise<{ id: string }>;
  sendText(msg: WhatsAppTextSend): Promise<{ id: string }>;
}

const digits = (phone: string) => phone.replace(/\D/g, "");

/** Meta language codes for the languages we support. */
export const META_LANGUAGE: Record<string, string> = { en: "en", hi: "hi", ur: "ur", pa: "pa" };

export interface MetaOptions {
  accessToken: string;
  apiVersion?: string;
}

export function metaWhatsApp(opts: MetaOptions, fetchImpl: Fetch = fetch): WhatsAppProvider {
  const base = `https://graph.facebook.com/${opts.apiVersion ?? "v21.0"}`;
  async function post(phoneNumberId: string, payload: Record<string, unknown>): Promise<{ id: string }> {
    const res = await fetchImpl(`${base}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${opts.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    const id = json.messages?.[0]?.id;
    if (!res.ok || !id) throw new Error(`WhatsApp send failed (${res.status}${json.error?.code ? ` ${json.error.code}` : ""}): ${json.error?.message ?? "unknown error"}`);
    return { id };
  }
  return {
    name: "meta",
    sendTemplate: (m) =>
      post(m.phoneNumberId, {
        to: digits(m.to),
        type: "template",
        template: {
          name: m.template,
          language: { code: META_LANGUAGE[m.language] ?? "en" },
          ...(m.params.length ? { components: [{ type: "body", parameters: m.params.map((text) => ({ type: "text", text })) }] } : {}),
        },
      }),
    sendText: (m) => post(m.phoneNumberId, { to: digits(m.to), type: "text", text: { preview_url: true, body: m.body } }),
  };
}

/** `sha256=<hex>` of the raw body with the app secret (X-Hub-Signature-256). */
export function hubSignature(appSecret: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
}

export function verifyHubSignature(appSecret: string, rawBody: string, header: string | undefined): boolean {
  if (!header) return false;
  return safeEqual(hubSignature(appSecret, rawBody), header);
}

/**
 * GET webhook verification: Meta calls with hub.mode=subscribe, hub.verify_token and hub.challenge.
 * Returns the challenge to echo, or null when the token doesn't match.
 */
export function verifyWebhookChallenge(query: Record<string, unknown>, verifyToken: string | undefined): string | null {
  if (!verifyToken || query["hub.mode"] !== "subscribe") return null;
  const token = String(query["hub.verify_token"] ?? "");
  const challenge = query["hub.challenge"];
  if (typeof challenge !== "string" || !token || !safeEqual(token, verifyToken)) return null;
  return challenge;
}

// ---------------------------------------------------------------------------
// Inbound payload (the parts we use)
// ---------------------------------------------------------------------------
export interface InboundWhatsAppMessage {
  /** Meta phone number id the message was sent to. */
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  /** Message id (wamid), used for idempotency. */
  id: string;
  /** Sender in E.164. */
  from: string;
  name: string | null;
  type: string;
  /** Text, or the title of a tapped button / list row. Empty for unsupported types. */
  text: string;
  at: Date;
}

/** Flatten a WhatsApp Cloud API webhook body into inbound messages. Ignores status callbacks. */
export function parseInboundWebhook(body: unknown): InboundWhatsAppMessage[] {
  const out: InboundWhatsAppMessage[] = [];
  const b = body as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] } | null;
  for (const entry of b?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value as
        | {
            metadata?: { phone_number_id?: string; display_phone_number?: string };
            contacts?: { wa_id?: string; profile?: { name?: string } }[];
            messages?: { id?: string; from?: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string; id?: string } } }[];
          }
        | undefined;
      const phoneNumberId = v?.metadata?.phone_number_id;
      if (!v || !phoneNumberId) continue;
      for (const m of v.messages ?? []) {
        if (!m.id || !m.from) continue;
        const type = m.type ?? "text";
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
        const contact = v.contacts?.find((c) => c.wa_id === m.from);
        out.push({
          phoneNumberId,
          displayPhoneNumber: v.metadata?.display_phone_number ?? null,
          id: m.id,
          from: `+${digits(m.from)}`,
          name: contact?.profile?.name ?? null,
          type,
          text: text.trim(),
          at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
const cache = new WeakMap<object, WhatsAppProvider>();

export function createWhatsAppProvider(config: Config): WhatsAppProvider {
  if (config.whatsapp.provider === "meta" && config.whatsapp.accessToken) return metaWhatsApp({ accessToken: config.whatsapp.accessToken, apiVersion: config.whatsapp.apiVersion });
  return new FakeWhatsApp();
}

/** ctx.providers.whatsapp when set (tests can inject one), else Meta when WHATSAPP_ACCESS_TOKEN is set, else the fake. */
export function getWhatsApp(ctx: Pick<AppContext, "providers" | "config">): WhatsAppProvider {
  if (ctx.providers.whatsapp) return ctx.providers.whatsapp;
  let p = cache.get(ctx.providers);
  if (!p) {
    p = createWhatsAppProvider(ctx.config);
    cache.set(ctx.providers, p);
  }
  return p;
}

export { FakeWhatsApp };
