/**
 * The real Instagram connector (Instagram API with Instagram Login): OAuth for a professional account, the last
 * INSTAGRAM_IMPORT_PER_THREAD messages per conversation on connect, and the messages webhook. Read-only by design: there is no
 * sending path. Compiled and tested for parsing, but switched on only with INSTAGRAM_DM_ENABLED=live after Meta App Review
 * (instagram_business_basic, instagram_business_manage_messages) and Business Verification.
 *
 * Env: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI (defaults to the API's /v1/public/instagram/callback).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { INSTAGRAM_IMPORT_PER_THREAD, type ConnectorThread, type ConnectorWebhookResult } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { HttpError } from "../../lib/errors.js";
import type { InboxConnector } from "./index.js";

const GRAPH = "https://graph.instagram.com/v21.0";

export const instagramRedirectUri = (ctx: AppContext) => process.env.INSTAGRAM_REDIRECT_URI || `${ctx.config.publicApiUrl}/v1/public/instagram/callback`;

function appCreds() {
  const id = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!id || !secret) throw new HttpError(503, "instagram_not_configured", "Instagram isn't set up on this server yet.");
  return { id, secret };
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const body = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new HttpError(502, "instagram_error", body.error?.message ?? `Instagram answered ${r.status}`);
  return body;
}

/** Verify Meta's X-Hub-Signature-256 over the raw body. */
export function verifyMetaSignature(secret: string, rawBody: string, header: string | undefined): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const want = createHmac("sha256", secret).update(rawBody).digest();
  const got = Buffer.from(header.slice(7), "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

interface WebhookBody {
  object?: string;
  entry?: { id?: string; time?: number; messaging?: { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } }[] }[];
}

/** Turn a messages webhook into threads (one per other person). Echoes are the shop's own replies sent from Instagram. */
export function parseInstagramWebhook(body: WebhookBody): ConnectorWebhookResult {
  const threads = new Map<string, ConnectorThread>();
  let account: string | null = null;
  for (const e of body.entry ?? []) {
    account = e.id ?? account;
    for (const m of e.messaging ?? []) {
      if (!m.message?.mid || typeof m.message.text !== "string") continue;
      const echo = !!m.message.is_echo;
      const other = echo ? m.recipient?.id : m.sender?.id;
      if (!other) continue;
      const t = threads.get(other) ?? { externalUserId: other, threadId: other, handle: null, displayName: null, messages: [] };
      t.messages.push({ externalId: m.message.mid, direction: echo ? "out" : "in", text: m.message.text.slice(0, 2000), at: new Date(m.timestamp ?? Date.now()).toISOString() });
      threads.set(other, t);
    }
  }
  return { externalAccountId: account, threads: [...threads.values()] };
}

export const instagramConnector: InboxConnector = {
  id: "instagram",
  mode: "live",
  async connect(ctx, _merchant, { state }) {
    const { id } = appCreds();
    const q = new URLSearchParams({ client_id: id, redirect_uri: instagramRedirectUri(ctx), response_type: "code", scope: "instagram_business_basic,instagram_business_manage_messages", state });
    return { authorizeUrl: `https://www.instagram.com/oauth/authorize?${q}`, account: null };
  },
  async completeOAuth(ctx, code) {
    const { id, secret } = appCreds();
    const form = new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri: instagramRedirectUri(ctx), code });
    const short = await getJson<{ access_token: string; user_id: number | string }>("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
    const long = await getJson<{ access_token: string }>(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(secret)}&access_token=${encodeURIComponent(short.access_token)}`);
    const me = await getJson<{ user_id?: string; id?: string; username?: string }>(`${GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(long.access_token)}`);
    return { externalAccountId: String(me.user_id ?? me.id ?? short.user_id), username: me.username ?? null, token: long.access_token };
  },
  async importRecent(_ctx, account) {
    if (!account.token) return [];
    const fields = `participants,messages.limit(${INSTAGRAM_IMPORT_PER_THREAD}){id,from,to,message,created_time}`;
    const r = await getJson<{ data?: { id: string; participants?: { data?: { id: string; username?: string }[] }; messages?: { data?: { id: string; from?: { id: string; username?: string }; message?: string; created_time?: string }[] } }[] }>(
      `${GRAPH}/me/conversations?platform=instagram&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(account.token)}`,
    );
    return (r.data ?? []).flatMap((c): ConnectorThread[] => {
      const other = c.participants?.data?.find((p) => p.id !== account.externalAccountId);
      if (!other) return [];
      return [
        {
          externalUserId: other.id,
          threadId: c.id,
          handle: other.username ?? null,
          displayName: null,
          messages: (c.messages?.data ?? [])
            .filter((m) => typeof m.message === "string" && m.message.length > 0)
            .map((m) => ({ externalId: m.id, direction: m.from?.id === account.externalAccountId ? ("out" as const) : ("in" as const), text: m.message!.slice(0, 2000), at: m.created_time ?? new Date().toISOString() })),
        },
      ];
    });
  },
  async handleWebhook(_ctx, headers, rawBody) {
    const { secret } = appCreds();
    const sig = headers["x-hub-signature-256"];
    if (!verifyMetaSignature(secret, rawBody, Array.isArray(sig) ? sig[0] : sig)) throw new HttpError(401, "bad_signature", "Webhook signature didn't match");
    return parseInstagramWebhook(JSON.parse(rawBody) as WebhookBody);
  },
  async disconnect() {
    // Instagram Login tokens can't be revoked by API; the token is deleted on our side and the owner can remove the app on Instagram.
  },
};
