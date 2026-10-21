import type { FastifyInstance } from "fastify";
import { authApi } from "@ll/shared";
import type { AppContext } from "../../context.js";
import { requireStaff, requireUser } from "../../lib/auth.js";
import { parse } from "../../lib/validate.js";
import { requireUuid } from "../../services/customer.js";
import {
  getMe,
  login,
  refreshSession,
  register as registerUser,
  revokeSession,
  setStaffPin,
  startEmailOtp,
  startPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
  verifyStaffPin,
} from "../../services/auth.js";

export default async function register(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const ua = (h: string | string[] | undefined) => (Array.isArray(h) ? h[0] : h) ?? null;

  app.post("/auth/otp/start", async (req) => {
    const body = parse(authApi.otpStartBody, req.body);
    return startPhoneOtp(ctx, body.phone);
  });

  app.post("/auth/otp/verify", async (req) => {
    const body = parse(authApi.otpVerifyBody, req.body);
    return verifyPhoneOtp(ctx, body, ua(req.headers["user-agent"]));
  });

  app.post("/auth/register", async (req, reply) => {
    const body = parse(authApi.registerBody, req.body);
    const res = await registerUser(ctx, body, ua(req.headers["user-agent"]));
    return reply.status(201).send(res);
  });

  app.post("/auth/login", async (req) => {
    const body = parse(authApi.loginBody, req.body);
    return login(ctx, body, ua(req.headers["user-agent"]));
  });

  app.post("/auth/email-otp/start", async (req) => {
    const body = parse(authApi.emailOtpStartBody, req.body);
    return startEmailOtp(ctx, body.email);
  });

  app.post("/auth/email-otp/verify", async (req) => {
    const body = parse(authApi.emailOtpVerifyBody, req.body);
    return verifyEmailOtp(ctx, body, ua(req.headers["user-agent"]));
  });

  app.post("/auth/refresh", async (req) => {
    const body = parse(authApi.refreshBody, req.body);
    return refreshSession(ctx, body.refreshToken, ua(req.headers["user-agent"]));
  });

  app.post("/auth/logout", async (req) => {
    const body = parse(authApi.refreshBody, req.body);
    await revokeSession(ctx, body.refreshToken);
    return { ok: true } satisfies authApi.OkResponse;
  });

  app.get("/auth/me", async (req) => getMe(ctx, requireUser(req)));

  app.put<{ Params: { merchantId: string } }>("/merchants/:merchantId/staff-pin", async (req) => {
    const user = requireUser(req);
    const body = parse(authApi.staffPinSetBody, req.body);
    const staff = await requireStaff(ctx, req, requireUuid(req.params.merchantId, "Merchant"), "staff");
    await setStaffPin(ctx, staff.merchant.id, user.id, body.pin);
    return { ok: true } satisfies authApi.OkResponse;
  });

  app.post<{ Params: { merchantId: string } }>("/merchants/:merchantId/staff-pin/verify", async (req) => {
    const staff = await requireStaff(ctx, req, requireUuid(req.params.merchantId, "Merchant"), "staff");
    const body = parse(authApi.staffPinVerifyBody, req.body);
    return verifyStaffPin(ctx, { merchantId: staff.merchant.id, deviceUserId: staff.user.id, pin: body.pin, userId: body.userId, ip: req.ip });
  });
}
