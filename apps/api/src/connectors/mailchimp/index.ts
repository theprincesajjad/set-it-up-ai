/**
 * Mailchimp: OAuth, then sync members who gave CASL express consent (and
 * haven't muted the shop) into one audience. Members who withdraw consent are
 * set to "unsubscribed". Only email + first/last name are sent.
 * Docs: https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/
 */
import { createHash } from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { merchantMembers, users } from "@ll/db";
import type { ApiContext, Connector } from "../types.js";
import { requestJson } from "../util.js";

const BATCH = 500;
export const subscriberHash = (email: string) => createHash("md5").update(email.trim().toLowerCase()).digest("hex");

const api = (a: ApiContext, path: string, init: Parameters<typeof requestJson>[2] = {}) =>
  requestJson(a.fetch, `${a.credentials.extra?.apiEndpoint}/3.0${path}`, { ...init, headers: { authorization: `Bearer ${a.credentials.accessToken}`, ...init.headers } });

export const mailchimp: Connector = {
  id: "mailchimp",
  name: "Mailchimp",
  category: "marketing",
  description: "Keep a Mailchimp audience in sync with members who opted in to your emails.",
  auth: "oauth",
  configured: (c) => !!(c.mailchimp.clientId && c.mailchimp.clientSecret),
  setup: { envVars: ["MAILCHIMP_CLIENT_ID", "MAILCHIMP_CLIENT_SECRET"] },
  authUrl(config, { state, redirectUri }) {
    const q = new URLSearchParams({ response_type: "code", client_id: config.mailchimp.clientId!, redirect_uri: redirectUri, state });
    return `https://login.mailchimp.com/oauth2/authorize?${q.toString()}`;
  },
  async exchangeCode(config, { code, redirectUri }, fetch) {
    const t = await requestJson(fetch, "https://login.mailchimp.com/oauth2/token", {
      method: "POST",
      form: { grant_type: "authorization_code", client_id: config.mailchimp.clientId!, client_secret: config.mailchimp.clientSecret!, redirect_uri: redirectUri, code },
    });
    const meta = await requestJson(fetch, "https://login.mailchimp.com/oauth2/metadata", { headers: { authorization: `OAuth ${t.access_token}` } });
    return {
      credentials: { accessToken: t.access_token, extra: { apiEndpoint: String(meta.api_endpoint), dc: String(meta.dc ?? "") } },
      externalAccountId: String(meta.user_id ?? meta.login?.login_id ?? meta.accountname),
      settings: { accountName: meta.accountname ?? null },
    };
  },
  async sync(a, ctx, merchantId) {
    const { lists = [] } = await api(a, "/lists?count=100&fields=lists.id,lists.name");
    const audiences = lists.map((l: any) => ({ id: String(l.id), name: String(l.name) }));
    const audienceId = (a.settings.audienceId as string) ?? (audiences.length === 1 ? audiences[0].id : null);
    if (!audienceId) return { settings: { audiences }, stats: { subscribed: 0, unsubscribed: 0 } };

    const rows = await ctx.db
      .select({ email: users.email, name: users.name, consentAt: merchantMembers.marketingConsentAt, muted: merchantMembers.muted })
      .from(merchantMembers)
      .innerJoin(users, eq(users.id, merchantMembers.userId))
      .where(and(eq(merchantMembers.merchantId, merchantId), isNotNull(users.email)));
    const consenting = rows.filter((r) => r.email && r.consentAt && !r.muted);
    const previously = new Set((a.settings.syncedHashes as string[] | undefined) ?? []);
    const nowSynced = new Set<string>();
    let subscribed = 0;
    for (let i = 0; i < consenting.length; i += BATCH) {
      const chunk = consenting.slice(i, i + BATCH);
      await api(a, `/lists/${encodeURIComponent(audienceId)}`, {
        method: "POST",
        json: {
          update_existing: true,
          members: chunk.map((r) => {
            const [first, ...rest] = (r.name ?? "").split(" ");
            return {
              email_address: r.email,
              status: "subscribed",
              status_if_new: "subscribed",
              timestamp_opt: r.consentAt!.toISOString(),
              merge_fields: { FNAME: first ?? "", LNAME: rest.join(" ") },
            };
          }),
        },
      });
      subscribed += chunk.length;
      chunk.forEach((r) => nowSynced.add(subscriberHash(r.email!)));
    }
    // Withdrawn consent (STOP, unsubscribe, muted): unsubscribe only people we previously synced.
    let unsubscribed = 0;
    for (const hash of previously) {
      if (nowSynced.has(hash)) continue;
      try {
        await api(a, `/lists/${encodeURIComponent(audienceId)}/members/${hash}`, { method: "PATCH", json: { status: "unsubscribed" } });
        unsubscribed++;
      } catch (err) {
        if ((err as { status?: number }).status !== 404) throw err;
      }
    }
    return { settings: { audiences, audienceId, syncedHashes: [...nowSynced] }, stats: { subscribed, unsubscribed } };
  },
};
