/**
 * The Instagram stub: behaves like a connected professional account with a few sample DMs, so the inbox, "Create booking from
 * message" and disconnect-purge can be built, tested and shown before Meta's review. Never talks to Meta. On only when
 * INSTAGRAM_DM_ENABLED=stub.
 */
import type { ConnectorThread } from "@ll/shared";
import type { InboxConnector } from "./index.js";

const MIN = 60_000;

/** The sample threads, with times relative to now so they read as recent. Exported for tests. */
export function stubThreads(now: Date): ConnectorThread[] {
  const at = (minsAgo: number) => new Date(now.getTime() - minsAgo * MIN).toISOString();
  return [
    {
      externalUserId: "stub_ig_user_maya",
      threadId: "stub_ig_thread_maya",
      handle: "maya.chen",
      displayName: "Maya Chen",
      messages: [
        { externalId: "stub_mid_maya_1", direction: "in", text: "Hi! Do you have anything Saturday afternoon for a classic fill?", at: at(42) },
        { externalId: "stub_mid_maya_2", direction: "in", text: "Anytime after 1 works for me", at: at(40) },
      ],
    },
    {
      externalUserId: "stub_ig_user_jordan",
      threadId: "stub_ig_thread_jordan",
      handle: "jordan.r",
      displayName: "Jordan Reyes",
      messages: [{ externalId: "stub_mid_jordan_1", direction: "in", text: "How much is brow lamination with a tint?", at: at(180) }],
    },
    {
      externalUserId: "stub_ig_user_aisha",
      threadId: "stub_ig_thread_aisha",
      handle: "aisha.k",
      displayName: "Aisha Khan",
      messages: [
        { externalId: "stub_mid_aisha_1", direction: "in", text: "Can I book a lash lift next Tuesday evening?", at: at(26 * 60) },
        { externalId: "stub_mid_aisha_2", direction: "out", text: "Yes! I have 6 pm open.", at: at(25 * 60) },
        { externalId: "stub_mid_aisha_3", direction: "in", text: "Perfect, 6 pm please", at: at(24 * 60) },
      ],
    },
  ];
}

export const instagramStubConnector: InboxConnector = {
  id: "instagram",
  mode: "stub",
  async connect(_ctx, merchant) {
    return { authorizeUrl: null, account: { externalAccountId: `stub_ig_account_${merchant.id}`, username: merchant.slug.replace(/-/g, "."), token: null } };
  },
  async completeOAuth() {
    throw new Error("The Instagram stub connects without OAuth");
  },
  async importRecent(ctx) {
    return stubThreads(ctx.now());
  },
  async handleWebhook(_ctx, _headers, rawBody) {
    // Tests post { account, threads } straight through.
    const body = JSON.parse(rawBody || "{}") as { account?: string; threads?: ConnectorThread[] };
    return { externalAccountId: body.account ?? null, threads: body.threads ?? [] };
  },
  async disconnect() {},
};
