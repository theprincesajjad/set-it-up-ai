import type { FastifyInstance } from "fastify";
import { customerApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireUser } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { revokeAllSessions } from "../../services/auth.js";
import registerWaitlist from "./waitlist.js"; // phase-pro: p2
import {
  cancelRedemption,
  deleteAccount,
  exportData,
  getCard,
  getMembershipDetail,
  getOrCreateReferral,
  getProfile,
  getWallet,
  grantConsent,
  joinMerchant,
  redeemFromApp,
  registerPushToken,
  setMuted,
  unregisterPushToken,
  updateProfile,
  withdrawConsent,
} from "../../services/customer.js";

type MemberReq = { Params: { memberId: string } };

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  await registerWaitlist(app, ctx); // phase-pro: p2 (my waitlist)
  // ---- Profile & PIPEDA ----
  app.get("/me", async (req) => getProfile(ctx, requireUser(req).id));

  app.patch("/me", async (req) => {
    const user = requireUser(req);
    return updateProfile(ctx, user.id, parse(customerApi.updateProfileBody, req.body));
  });

  app.delete("/me", async (req, reply) => {
    const user = requireUser(req);
    parse(customerApi.deleteAccountBody, req.body);
    await deleteAccount(ctx, user.id);
    await revokeAllSessions(ctx, user.id);
    return reply.status(204).send();
  });

  app.get("/me/export", async (req, reply) => {
    const data = await exportData(ctx, requireUser(req).id);
    return reply.header("content-disposition", `attachment; filename="my-data-${data.exportedAt.slice(0, 10)}.json"`).send(data);
  });

  app.get("/me/card", async (req) => getCard(ctx, requireUser(req).id));

  // ---- Wallet ----
  app.get("/me/memberships", async (req) => getWallet(ctx, requireUser(req).id));

  app.post("/me/memberships", async (req, reply) => {
    const user = requireUser(req);
    const res = await joinMerchant(ctx, user.id, parse(customerApi.joinBody, req.body));
    return reply.status(res.created ? 201 : 200).send(res);
  });

  app.get<MemberReq>("/me/memberships/:memberId", async (req) => {
    const user = requireUser(req);
    return getMembershipDetail(ctx, user.id, req.params.memberId, parse(customerApi.membershipDetailQuery, req.query));
  });

  app.patch<MemberReq>("/me/memberships/:memberId", async (req) => {
    const user = requireUser(req);
    const body = parse(customerApi.updateMembershipBody, req.body);
    return setMuted(ctx, user.id, req.params.memberId, body.muted);
  });

  app.post<MemberReq>("/me/memberships/:memberId/consent", async (req) => {
    const user = requireUser(req);
    const body = parse(customerApi.consentSchema, req.body);
    return grantConsent(ctx, user.id, req.params.memberId, body.text);
  });

  app.delete<MemberReq>("/me/memberships/:memberId/consent", async (req) => {
    const user = requireUser(req);
    return withdrawConsent(ctx, user.id, req.params.memberId);
  });

  app.post<MemberReq>("/me/memberships/:memberId/redeem", async (req, reply) => {
    const user = requireUser(req);
    const body = parse(customerApi.customerRedeemBody, req.body);
    const header = req.headers["idempotency-key"];
    const res = await redeemFromApp(ctx, user.id, req.params.memberId, { ...body, idempotencyKey: body.idempotencyKey ?? (typeof header === "string" ? header : undefined) });
    return reply.status(res.duplicate ? 200 : 201).send(res);
  });

  app.delete<{ Params: { redemptionId: string } }>("/me/redemptions/:redemptionId", async (req) => {
    const user = requireUser(req);
    return cancelRedemption(ctx, user.id, req.params.redemptionId);
  });

  app.get<MemberReq>("/me/memberships/:memberId/referral", async (req) => getOrCreateReferral(ctx, requireUser(req).id, req.params.memberId, false));
  app.post<MemberReq>("/me/memberships/:memberId/referral", async (req, reply) => {
    const res = await getOrCreateReferral(ctx, requireUser(req).id, req.params.memberId, true);
    return reply.status(201).send(res);
  });

  // ---- Push ----
  app.post("/me/push-tokens", async (req, reply) => {
    const user = requireUser(req);
    await registerPushToken(ctx, user.id, parse(customerApi.pushTokenBody, req.body));
    return reply.status(204).send();
  });

  app.delete<{ Params: { token: string } }>("/me/push-tokens/:token", async (req, reply) => {
    const user = requireUser(req);
    await unregisterPushToken(ctx, user.id, req.params.token);
    return reply.status(204).send();
  });
}
