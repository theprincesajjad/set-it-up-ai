import { createHmac } from "node:crypto";
import { safeEqual } from "../lib/crypto.js";
import type { SmsProvider } from "./types.js";

export type Fetch = typeof fetch;

export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  /** Prefer a Messaging Service (handles sender pools, opt-out, A2P). */
  messagingServiceSid?: string;
  from?: string;
  /** Optional delivery status callback URL. */
  statusCallback?: string;
}

/** Twilio Programmable SMS over the REST API (no SDK). */
export function twilioSms(opts: TwilioOptions, fetchImpl: Fetch = fetch): SmsProvider {
  if (!opts.messagingServiceSid && !opts.from) throw new Error("Twilio needs TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(opts.accountSid)}/Messages.json`;
  const auth = Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64");
  return {
    name: "twilio",
    async send(to, body) {
      const form = new URLSearchParams({ To: to, Body: body });
      if (opts.messagingServiceSid) form.set("MessagingServiceSid", opts.messagingServiceSid);
      else form.set("From", opts.from!);
      if (opts.statusCallback) form.set("StatusCallback", opts.statusCallback);
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
      if (!res.ok || !json.sid) throw new Error(`Twilio send failed (${res.status}${json.code ? ` ${json.code}` : ""}): ${json.message ?? "unknown error"}`);
      return { id: json.sid };
    },
  };
}

/**
 * X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + concat(sorted(key + value)))).
 * `url` must be the exact public URL Twilio called (including query string).
 */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + (params[k] ?? ""), url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | undefined): boolean {
  if (!signature) return false;
  return safeEqual(twilioSignature(authToken, url, params), signature);
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/** TwiML response; empty when there is nothing to reply. */
export function twiml(message?: string | null): string {
  return message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}
