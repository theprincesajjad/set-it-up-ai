import type { EmailProvider } from "./types.js";

export type Fetch = typeof fetch;

/** Resend transactional email (https://resend.com/docs/api-reference/emails/send-email). */
export function resendEmail(opts: { apiKey: string; from: string; replyTo?: string }, fetchImpl: Fetch = fetch): EmailProvider {
  return {
    name: "resend",
    async send(msg) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: opts.from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          ...(msg.html ? { html: msg.html } : {}),
          ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!res.ok || !json.id) throw new Error(`Resend send failed (${res.status}): ${json.message ?? json.name ?? "unknown error"}`);
      return { id: json.id };
    },
  };
}
