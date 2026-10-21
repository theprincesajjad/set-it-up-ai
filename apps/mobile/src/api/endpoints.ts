/**
 * One typed function per documented endpoint the app uses. Request/response
 * types come from packages/shared/src/api/* (the contract the API teams own);
 * paths follow docs/engineering/api/*.md.
 */
import type {
  adsApi,
  authApi,
  campaignsApi,
  commerceApi,
  customerApi,
  merchantApi,
  networkApi,
  serviceApi,
  staffApi,
  walletApi,
} from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export type Endpoints = ReturnType<typeof createEndpoints>;

export function createEndpoints(c: ApiClient) {
  const m = (merchantId: string) => `/v1/merchants/${enc(merchantId)}`;
  const counter = (merchantId: string) => `${m(merchantId)}/counter`;

  return {
    auth: {
      otpStart: (phone: string) => c.post<authApi.OtpStartResponse>("/v1/auth/otp/start", { phone }, { auth: "none" }),
      otpVerify: (body: authApi.OtpVerifyBody) => c.post<authApi.AuthResponse>("/v1/auth/otp/verify", body, { auth: "none" }),
      login: (body: authApi.LoginBody) => c.post<authApi.AuthResponse>("/v1/auth/login", body, { auth: "none" }),
      emailOtpStart: (email: string) => c.post<authApi.OtpStartResponse>("/v1/auth/email-otp/start", { email }, { auth: "none" }),
      emailOtpVerify: (body: authApi.EmailOtpVerifyBody) => c.post<authApi.AuthResponse>("/v1/auth/email-otp/verify", body, { auth: "none" }),
      logout: (refreshToken: string) => c.post<authApi.OkResponse>("/v1/auth/logout", { refreshToken }, { auth: "none" }),
      me: () => c.get<authApi.MeResponse>("/v1/auth/me"),
      verifyStaffPin: (merchantId: string, body: authApi.StaffPinVerifyBody) =>
        c.post<authApi.StaffPinVerifyResponse>(`${m(merchantId)}/staff-pin/verify`, body),
      setStaffPin: (merchantId: string, pin: string) => c.put<authApi.OkResponse>(`${m(merchantId)}/staff-pin`, { pin }),
    },

    me: {
      profile: () => c.get<customerApi.ProfileDto>("/v1/me"),
      updateProfile: (body: customerApi.UpdateProfileBody) => c.patch<customerApi.ProfileDto>("/v1/me", body),
      deleteAccount: () => c.del<void>("/v1/me", { confirm: "DELETE" }),
      exportData: () => c.get<customerApi.DataExportResponse>("/v1/me/export"),
      memberships: () => c.get<customerApi.WalletResponse>("/v1/me/memberships"),
      join: (body: customerApi.JoinBody) => c.post<customerApi.JoinResponse>("/v1/me/memberships", body),
      membership: (memberId: string, historyLimit = 30, historyCursor?: string) =>
        c.get<customerApi.MembershipDetailResponse>(`/v1/me/memberships/${enc(memberId)}`, { query: { historyLimit, historyCursor } }),
      setMuted: (memberId: string, muted: boolean) => c.patch<customerApi.MembershipDto>(`/v1/me/memberships/${enc(memberId)}`, { muted }),
      grantConsent: (memberId: string, text: string) => c.post<customerApi.MembershipDto>(`/v1/me/memberships/${enc(memberId)}/consent`, { text }),
      withdrawConsent: (memberId: string) => c.del<customerApi.MembershipDto>(`/v1/me/memberships/${enc(memberId)}/consent`),
      redeem: (memberId: string, rewardId: string, idempotencyKey: string) =>
        c.post<customerApi.CustomerRedeemResponse>(`/v1/me/memberships/${enc(memberId)}/redeem`, { rewardId, idempotencyKey }, { idempotencyKey }),
      cancelRedemption: (redemptionId: string) => c.del<{ balance: number }>(`/v1/me/redemptions/${enc(redemptionId)}`),
      card: () => c.get<customerApi.CardResponse>("/v1/me/card"),
      registerPushToken: (body: customerApi.PushTokenBody) => c.post<void>("/v1/me/push-tokens", body),
      removePushToken: (token: string) => c.del<void>(`/v1/me/push-tokens/${enc(token)}`),
      referral: (memberId: string) => c.get<customerApi.ReferralResponse>(`/v1/me/memberships/${enc(memberId)}/referral`),
      newReferral: (memberId: string) => c.post<customerApi.ReferralResponse>(`/v1/me/memberships/${enc(memberId)}/referral`),
      campaigns: (lat?: number, lng?: number) => c.get<{ items: campaignsApi.MyCampaign[] }>("/v1/me/campaigns", { query: { lat, lng } }),
    },

    wallet: {
      status: () => c.get<walletApi.WalletStatusResponse>("/v1/me/wallet"),
      appleLink: () => c.get<walletApi.AppleLinkResponse>("/v1/me/wallet/apple/link"),
      google: () => c.get<walletApi.GoogleSaveResponse>("/v1/me/wallet/google"),
    },

    network: {
      neighbourhoods: () => c.get<networkApi.NeighbourhoodsResponse>("/v1/network/neighbourhoods", { auth: "optional" }),
      neighbourhood: (slug: string) => c.get<networkApi.NeighbourhoodDetailResponse>(`/v1/network/neighbourhoods/${enc(slug)}`, { auth: "optional" }),
      shops: (q: { lat?: number; lng?: number; neighbourhood?: string; vertical?: string; q?: string; radiusMetres?: number; limit?: number; cursor?: string }) =>
        c.get<networkApi.ShopsResponse>("/v1/network/shops", { query: q, auth: "optional" }),
      feed: (q: { lat?: number; lng?: number; neighbourhood?: string; limit?: number; cursor?: string }) =>
        c.get<networkApi.FeedResponse>("/v1/network/feed", { query: q, auth: "optional" }),
      promoView: (promoId: string) => c.post<networkApi.PromoCounterResponse>(`/v1/network/promos/${enc(promoId)}/view`, undefined, { auth: "optional" }),
      promoClaim: (promoId: string) => c.post<networkApi.PromoCounterResponse>(`/v1/network/promos/${enc(promoId)}/claim`, undefined, { auth: "optional" }),
      shop: (slug: string) => c.get<networkApi.PublicShopResponse>(`/v1/public/shops/${enc(slug)}`, { auth: "optional" }),
      joinInfo: (qrCode: string) => c.get<networkApi.JoinInfoResponse>(`/v1/public/join/${enc(qrCode)}`, { auth: "none" }),
      campaign: (id: string) => c.get<campaignsApi.PublicCampaign>(`/v1/public/campaigns/${enc(id)}`, { auth: "optional" }),
    },

    ads: {
      impression: (adId: string) => c.post<adsApi.TrackResponse>(`/v1/ads/${enc(adId)}/impression`),
      click: (adId: string) => c.post<adsApi.TrackResponse>(`/v1/ads/${enc(adId)}/click`),
    },

    commerce: {
      /** 402 feature_locked when order-ahead isn't enabled for the shop: the app hides the entry point. */
      menu: (slug: string) => c.get<commerceApi.PublicMenuResponse>(`/v1/public/shops/${enc(slug)}/menu`, { auth: "optional" }),
      slots: (slug: string, q: { kind?: "pickup"; locationId?: string; from?: string; to?: string } = {}) =>
        c.get<{ items: commerceApi.SlotDto[] }>(`/v1/public/shops/${enc(slug)}/slots`, { query: q, auth: "optional" }),
      placeOrder: (body: commerceApi.PlaceOrderBody) =>
        c.post<commerceApi.PlaceOrderResponse>("/v1/me/orders", body, { idempotencyKey: body.idempotencyKey }),
      orders: (cursor?: string) => c.get<{ items: commerceApi.OrderDto[]; nextCursor: string | null }>("/v1/me/orders", { query: { cursor, limit: 50 } }),
      order: (orderId: string) => c.get<commerceApi.OrderDto>(`/v1/me/orders/${enc(orderId)}`),
      cancelOrder: (orderId: string, reason?: string) => c.post<commerceApi.OrderDto>(`/v1/me/orders/${enc(orderId)}/cancel`, { reason: reason ?? null }),
    },

    service: {
      tickets: (cursor?: string) => c.get<{ items: serviceApi.TicketDto[]; nextCursor: string | null }>("/v1/me/tickets", { query: { cursor, limit: 50 } }),
      ticket: (ticketId: string) => c.get<serviceApi.TicketDetailResponse>(`/v1/me/tickets/${enc(ticketId)}`),
      approveQuote: (quoteId: string, signatureName: string) =>
        c.post<serviceApi.ApproveQuoteResponse>(`/v1/me/quotes/${enc(quoteId)}/approve`, { signatureName }),
      declineQuote: (quoteId: string, reason?: string) => c.post<serviceApi.ApproveQuoteResponse>(`/v1/me/quotes/${enc(quoteId)}/decline`, { reason }),
      publicQuote: (token: string) => c.get<serviceApi.PublicQuoteResponse>(`/v1/public/quotes/${enc(token)}`, { auth: "none" }),
      payInvoice: (invoiceId: string) => c.post<serviceApi.PayInvoiceResponse>(`/v1/me/invoices/${enc(invoiceId)}/pay`),
    },

    merchant: {
      detail: (merchantId: string) => c.get<merchantApi.MerchantDetail>(m(merchantId), { auth: "staff" }),
      locations: (merchantId: string) => c.get<{ items: merchantApi.Location[] }>(`${m(merchantId)}/locations`, { auth: "staff" }),
      /** Manager+ only; the PIN switcher falls back to a plain PIN pad on 403. */
      team: (merchantId: string) => c.get<{ items: merchantApi.StaffMember[] }>(`${m(merchantId)}/team`),
      categories: (merchantId: string) => c.get<{ items: merchantApi.Category[] }>(`${m(merchantId)}/categories`, { auth: "staff" }),
      rewards: (merchantId: string) => c.get<{ items: merchantApi.Reward[] }>(`${m(merchantId)}/rewards`, { auth: "staff" }),
      promos: (merchantId: string) => c.get<{ items: merchantApi.Promo[] }>(`${m(merchantId)}/promos`, { auth: "staff", query: { status: "live" } }),
    },

    counter: {
      lookup: (merchantId: string, q: string) => c.get<staffApi.LookupResponse>(`${counter(merchantId)}/lookup`, { query: { q }, auth: "staff", timeoutMs: 6000 }),
      award: (merchantId: string, body: staffApi.AwardBody & { idempotencyKey: string }) =>
        c.post<staffApi.AwardResponse>(`${counter(merchantId)}/award`, body, { auth: "staff", idempotencyKey: body.idempotencyKey, timeoutMs: 6000 }),
      redeem: (merchantId: string, body: staffApi.RedeemBody & { idempotencyKey: string }) =>
        c.post<staffApi.CounterRedemptionResponse>(`${counter(merchantId)}/redeem`, body, { auth: "staff", idempotencyKey: body.idempotencyKey }),
      verifyRedemption: (merchantId: string, code: string) =>
        c.post<staffApi.CounterRedemptionResponse>(`${counter(merchantId)}/redemptions/verify`, { code }, { auth: "staff" }),
      today: (merchantId: string, locationId?: string) => c.get<staffApi.TodayResponse>(`${counter(merchantId)}/today`, { query: { locationId }, auth: "staff" }),
      activity: (merchantId: string, locationId?: string, limit = 25) =>
        c.get<staffApi.ActivityResponse>(`${counter(merchantId)}/activity`, { query: { locationId, limit }, auth: "staff" }),
      undo: (merchantId: string, transactionId: string, reason = "Undo at counter") =>
        c.post<staffApi.UndoResponse>(`${counter(merchantId)}/transactions/${enc(transactionId)}/undo`, { reason }, { auth: "staff" }),
      sync: (merchantId: string, events: staffApi.SyncEvent[]) =>
        c.post<staffApi.SyncResponse>(`${counter(merchantId)}/sync`, { events }, { auth: "staff", timeoutMs: 20_000 }),
      kioskCheckIn: (merchantId: string, body: staffApi.KioskCheckInBody) =>
        c.post<staffApi.KioskCheckInResponse>(`${counter(merchantId)}/kiosk/check-in`, body, { auth: "staff", idempotencyKey: body.idempotencyKey }),
    },
  };
}
