/**
 * Typed wrappers around the API contract in @ll/shared. Each group takes an
 * `ApiClient`, so the same functions work on the server (`getServerApi()`)
 * and in the browser (`browserApi`, which goes through the /api/ll BFF).
 *
 * Dashboard / rep / admin engineers: add `merchant`, `rep`, `admin` groups here
 * (or in their own files) following the same pattern.
 */
import type {
  authApi,
  campaignsApi,
  commerceApi,
  customerApi,
  networkApi,
  serviceApi,
  walletApi,
} from "@ll/shared";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;

export function llApi(c: ApiClient) {
  return {
    auth: {
      otpStart: (phone: string) => c.post<authApi.OtpStartResponse>("/v1/auth/otp/start", { phone }, { anonymous: true }),
      emailOtpStart: (email: string) => c.post<authApi.OtpStartResponse>("/v1/auth/email-otp/start", { email }, { anonymous: true }),
      me: () => c.get<authApi.MeResponse>("/v1/auth/me"),
    },
    network: {
      neighbourhoods: () => c.get<networkApi.NeighbourhoodsResponse>("/v1/network/neighbourhoods", { anonymous: true }),
      neighbourhood: (slug: string) =>
        c.get<networkApi.NeighbourhoodDetailResponse>(`/v1/network/neighbourhoods/${enc(slug)}`, { anonymous: true }),
      shops: (q: Partial<networkApi.ShopsQuery> = {}) =>
        c.get<networkApi.ShopsResponse>("/v1/network/shops", { query: q as Record<string, string | number | undefined> }),
      feed: (q: Partial<networkApi.FeedQuery> = {}) =>
        c.get<networkApi.FeedResponse>("/v1/network/feed", { query: q as Record<string, string | number | undefined> }),
    },
    public: {
      shop: (slug: string) => c.get<networkApi.PublicShopResponse>(`/v1/public/shops/${enc(slug)}`, { anonymous: true }),
      joinInfo: (qrCode: string) => c.get<networkApi.JoinInfoResponse>(`/v1/public/join/${enc(qrCode)}`, { anonymous: true }),
      joinStart: (qrCode: string, body: networkApi.PublicJoinBody) =>
        c.post<networkApi.PublicJoinResponse>(`/v1/public/join/${enc(qrCode)}`, body, { anonymous: true }),
      quote: (token: string) => c.get<serviceApi.PublicQuoteResponse>(`/v1/public/quotes/${enc(token)}`, { anonymous: true }),
      approveQuote: (token: string, signatureName: string) =>
        c.post<serviceApi.ApproveQuoteResponse>(`/v1/public/quotes/${enc(token)}/approve`, { signatureName }, { anonymous: true }),
      declineQuote: (token: string, reason?: string) =>
        c.post<serviceApi.ApproveQuoteResponse>(`/v1/public/quotes/${enc(token)}/decline`, reason ? { reason } : {}, { anonymous: true }),
      quoteDeposit: (token: string) =>
        c.post<{ deposit: serviceApi.DepositPaymentDto | null }>(`/v1/public/quotes/${enc(token)}/deposit`, {}, { anonymous: true }),
      invoice: (token: string) => c.get<serviceApi.PublicInvoiceResponse>(`/v1/public/invoices/${enc(token)}`, { anonymous: true }),
      payInvoice: (token: string) =>
        c.post<serviceApi.PayInvoiceResponse>(`/v1/public/invoices/${enc(token)}/pay`, {}, { anonymous: true }),
      campaign: (id: string) => c.get<campaignsApi.PublicCampaign>(`/v1/public/campaigns/${enc(id)}`, { anonymous: true }),
    },
    me: {
      profile: () => c.get<customerApi.ProfileDto>("/v1/me"),
      updateProfile: (body: customerApi.UpdateProfileBody) => c.patch<customerApi.ProfileDto>("/v1/me", body),
      deleteAccount: () => c.delete<void>("/v1/me", { confirm: "DELETE" }),
      exportData: () => c.get<customerApi.DataExportResponse>("/v1/me/export"),
      memberships: () => c.get<customerApi.WalletResponse>("/v1/me/memberships"),
      membership: (memberId: string, q: { historyLimit?: number; historyCursor?: string } = {}) =>
        c.get<customerApi.MembershipDetailResponse>(`/v1/me/memberships/${enc(memberId)}`, { query: q }),
      join: (body: customerApi.JoinBody) => c.post<customerApi.JoinResponse>("/v1/me/memberships", body),
      setMuted: (memberId: string, muted: boolean) =>
        c.patch<customerApi.MembershipDto>(`/v1/me/memberships/${enc(memberId)}`, { muted }),
      grantConsent: (memberId: string, text: string) =>
        c.post<customerApi.MembershipDto>(`/v1/me/memberships/${enc(memberId)}/consent`, { text }),
      withdrawConsent: (memberId: string) => c.delete<customerApi.MembershipDto>(`/v1/me/memberships/${enc(memberId)}/consent`),
      redeem: (memberId: string, rewardId: string, idempotencyKey: string) =>
        c.post<customerApi.CustomerRedeemResponse>(`/v1/me/memberships/${enc(memberId)}/redeem`, { rewardId, idempotencyKey }),
      cancelRedemption: (redemptionId: string) => c.delete<{ balance: number }>(`/v1/me/redemptions/${enc(redemptionId)}`),
      card: () => c.get<customerApi.CardResponse>("/v1/me/card"),
      referral: (memberId: string) => c.get<customerApi.ReferralResponse>(`/v1/me/memberships/${enc(memberId)}/referral`),
      wallet: () => c.get<walletApi.WalletStatusResponse>("/v1/me/wallet"),
      googleWallet: () => c.get<walletApi.GoogleSaveResponse>("/v1/me/wallet/google"),
      appleWalletLink: () => c.get<walletApi.AppleLinkResponse>("/v1/me/wallet/apple/link"),
      order: (orderId: string) => c.get<commerceApi.OrderDto>(`/v1/me/orders/${enc(orderId)}`),
      orders: () => c.get<{ items: commerceApi.OrderDto[]; nextCursor: string | null }>("/v1/me/orders"),
      campaigns: (q: { lat?: number; lng?: number } = {}) => c.get<{ items: campaignsApi.MyCampaign[] }>("/v1/me/campaigns", { query: q }),
      tickets: () => c.get<{ items: serviceApi.TicketDto[]; nextCursor: string | null }>("/v1/me/tickets"),
    },
    dev: {
      /** Dev/test only (FakePayments): docs/engineering/api/payments.md. */
      simulatePayment: (id: string, action: "succeed_payment" | "fail_payment" = "succeed_payment") =>
        c.post<{ events: { id: string; type: string }[] }>("/v1/payments/fake/simulate", { action, id }, { anonymous: true }),
    },
  };
}

export type LlApi = ReturnType<typeof llApi>;
