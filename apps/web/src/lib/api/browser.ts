"use client";
/**
 * Browser-side API access. Calls go to the same-origin BFF route `/api/ll/*`,
 * which attaches the httpOnly bearer cookie, refreshes on 401 and forwards to
 * the API. Tokens never touch client JavaScript.
 *
 *   import { browserApi, sessionApi } from "@/lib/api/browser";
 *   const wallet = await browserApi.me.memberships();
 *   await sessionApi.verifyOtp({ phone, code, name });   // sets the session cookies
 */
import { createApiClient } from "./client";
import { llApi } from "./endpoints";
import { notifySessionEnded } from "./sessionEvents";
import type { SessionResponse } from "../auth/session-types";
import { clearOfflineCard } from "../offlineCard";

export const BFF_BASE = "/api/ll";

export const browserClient = createApiClient({ baseUrl: BFF_BASE, credentials: "same-origin", onSessionEnded: notifySessionEnded });
export const browserApi = llApi(browserClient);

const authClient = createApiClient({ baseUrl: "/api/auth", credentials: "same-origin" });

/** Session route handlers (src/app/api/auth/*): they set / clear the httpOnly cookies. */
export const sessionApi = {
  verifyOtp: (body: { phone: string; code: string; name?: string }) => authClient.post<SessionResponse>("/otp/verify", body),
  verifyEmailOtp: (body: { email: string; code: string; name?: string }) => authClient.post<SessionResponse>("/email-otp/verify", body),
  login: (body: { email: string; password: string }) => authClient.post<SessionResponse>("/login", body),
  register: (body: { email: string; password: string; name: string }) => authClient.post<SessionResponse>("/register", body),
  /** Forgot password: the emailed code, then a new password; signs in. */
  resetPassword: (body: { email: string; code: string; password: string }) => authClient.post<SessionResponse>("/password-reset", body),
  /** Also forgets the member number saved for the offline page, so the next person on this phone never sees it. */
  logout: () => {
    clearOfflineCard();
    return authClient.post<{ ok: true }>("/logout", {});
  },
  session: () => authClient.get<{ user: SessionResponse["user"] | null }>("/session"),
};
