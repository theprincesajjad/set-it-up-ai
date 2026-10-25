/**
 * Typed wrappers around the API contract in @ll/shared. Each group takes an
 * `ApiClient`, so the same functions work on the server (`getServerApi()`)
 * and in the browser (`browserApi`, which goes through the /api/ll BFF).
 *
 * Dashboard groups: `merchant(id)` (dashboard + counter for one shop), `rep`, `admin`, `campaigns`
 * (BIA managers + admins). Contracts: docs/engineering/api/*.md.
 */
import type {
  adminApi,
  adsApi,
  authApi,
  billingApi,
  campaignsApi,
  commerceApi,
  customerApi,
  integrationsApi,
  merchantApi,
  messagingApi,
  networkApi,
  repApi,
  reportsApi,
  restaurantApi,
  serviceApi,
  staffApi,
  tiffinApi,
  walletApi,
  whatsappApi,
} from "@ll/shared";
import type { CustomOccasion, FestivalDef, FestivalOccurrence, FestivalRelevance, FestivalTemplate, FestivalTradition } from "@ll/shared";
import type { ApiClient } from "./client";
import { restaurantOpsEndpoints } from "./restaurantOps";
import { restaurantDeskEndpoints } from "./restaurantDesk";
import { publicSplitEndpoints, restaurantKitchenEndpoints } from "./restaurantKitchen";
import { restaurantWebEndpoints } from "./restaurantWeb";
import { appointmentEndpoints, myAppointmentEndpoints, publicAppointmentEndpoints } from "./appointments";
import { myBookingEndpoints, publicServiceEndpoints, serviceOpsEndpoints } from "./serviceOps";

const enc = encodeURIComponent;
type Q = Record<string, string | number | boolean | undefined | null>;
type Items<T> = { items: T[] };
type PageOf<T> = { items: T[]; nextCursor: string | null };

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
      approveQuote: (token: string, signatureName: string) =>
        c.post<serviceApi.ApproveQuoteResponse>(`/v1/public/quotes/${enc(token)}/approve`, { signatureName }, { anonymous: true }),
      declineQuote: (token: string, reason?: string) =>
        c.post<serviceApi.ApproveQuoteResponse>(`/v1/public/quotes/${enc(token)}/decline`, reason ? { reason } : {}, { anonymous: true }),
      quoteDeposit: (token: string) =>
        c.post<{ deposit: serviceApi.DepositPaymentDto | null }>(`/v1/public/quotes/${enc(token)}/deposit`, {}, { anonymous: true }),
      invoice: (token: string) => c.get<serviceApi.PublicInvoiceResponse>(`/v1/public/invoices/${enc(token)}`, { anonymous: true }),
      // Repair status page, quote (with preview), invoice pay with tip, drop-off slots (serviceOps.ts)
      ...publicServiceEndpoints(c),
      // Appointment booking: services, policy and availability (appointments.ts)
      ...publicAppointmentEndpoints(c),
      campaign: (id: string) => c.get<campaignsApi.PublicCampaign>(`/v1/public/campaigns/${enc(id)}`, { anonymous: true }),
      liveCampaigns: () => c.get<{ items: campaignsApi.PublicCampaign[] }>("/v1/public/live-campaigns", { anonymous: true }),
      plans: () => c.get<networkApi.PublicPlansResponse>("/v1/public/plans", { anonymous: true, next: { revalidate: 300 } }),
      /** Founding offer spots per corridor (restaurants page and pricing). */
      foundingRestaurants: () => c.get<networkApi.FoundingResponse>("/v1/public/restaurants/founding", { anonymous: true, next: { revalidate: 300 } }),
      lead: (body: repApi.PublicLeadBody) => c.post<repApi.PublicLeadResponse>("/v1/public/leads", body, { anonymous: true }),
      // Restaurant pack: review page (/r/:token) and WhatsApp order pay page (/pay/order/:orderId)
      review: (token: string) => c.get<whatsappApi.PublicReviewView>(`/v1/public/reviews/${enc(token)}`, { anonymous: true }),
      submitReview: (token: string, body: whatsappApi.ReviewSubmitBody) => c.post<whatsappApi.ReviewSubmitResponse>(`/v1/public/reviews/${enc(token)}`, body, { anonymous: true }),
      whatsappPay: (orderId: string, t: string) => c.get<whatsappApi.WhatsappPayView>(`/v1/public/whatsapp/pay/${enc(orderId)}`, { anonymous: true, query: { t } }),
      // App payment page (/pay/intent/:id?cs=): what a PaymentIntent from the mobile app is paying for
      paymentIntent: (paymentIntentId: string, cs: string) => c.get<restaurantApi.PaymentIntentView>(`/v1/public/payments/${enc(paymentIntentId)}`, { anonymous: true, query: { cs } }),
      // "Change card" page (/pay/setup/:id?cs=): the SetupIntent behind a tiffin subscription's saved card
      setupIntent: (setupIntentId: string, cs: string) => c.get<tiffinApi.SetupIntentView>(`/v1/public/payments/setup/${enc(setupIntentId)}`, { anonymous: true, query: { cs } }),
      // Split bill guest page (/pay/split/:token)
      ...publicSplitEndpoints(c),
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
      newReferral: (memberId: string) => c.post<customerApi.ReferralResponse>(`/v1/me/memberships/${enc(memberId)}/referral`),
      notifications: (q: { limit?: number; cursor?: string; unread?: boolean } = {}) =>
        c.get<customerApi.NotificationsResponse>("/v1/me/notifications", { query: { limit: q.limit ?? 30, cursor: q.cursor, unread: q.unread ? "1" : undefined } }),
      readNotification: (id: string) => c.post<customerApi.NotificationsReadResponse>(`/v1/me/notifications/${enc(id)}/read`),
      readAllNotifications: () => c.post<customerApi.NotificationsReadResponse>("/v1/me/notifications/read-all"),
      notificationPrefs: () => c.get<customerApi.NotificationPrefsResponse>("/v1/me/notification-prefs"),
      updateNotificationPrefs: (body: customerApi.UpdateNotificationPrefsBody) => c.put<customerApi.NotificationPrefsResponse>("/v1/me/notification-prefs", body),
      wallet: () => c.get<walletApi.WalletStatusResponse>("/v1/me/wallet"),
      googleWallet: () => c.get<walletApi.GoogleSaveResponse>("/v1/me/wallet/google"),
      appleWalletLink: () => c.get<walletApi.AppleLinkResponse>("/v1/me/wallet/apple/link"),
      order: (orderId: string) => c.get<commerceApi.OrderDto>(`/v1/me/orders/${enc(orderId)}`),
      orders: () => c.get<{ items: commerceApi.OrderDto[]; nextCursor: string | null }>("/v1/me/orders"),
      campaigns: (q: { lat?: number; lng?: number } = {}) => c.get<{ items: campaignsApi.MyCampaign[] }>("/v1/me/campaigns", { query: q }),
      tickets: () => c.get<{ items: serviceApi.TicketDto[]; nextCursor: string | null }>("/v1/me/tickets"),
      // Drop-off bookings: book, list, cancel (serviceOps.ts)
      ...myBookingEndpoints(c),
      // Appointments: book, list, move, cancel (appointments.ts)
      ...myAppointmentEndpoints(c),
    },
    merchants: {
      mine: () => c.get<PageOf<merchantApi.MyMerchant>>("/v1/merchants"),
      create: (body: merchantApi.CreateMerchantBody) => c.post<merchantApi.MerchantDetail>("/v1/merchants", body),
    },
    /** Everything under /v1/merchants/:merchantId (dashboard, counter, Phase 2/3 tools). */
    merchant: (merchantId: string) => merchantEndpoints(c, merchantId),
    /** Support sessions for an admin on any shop and a rep on the shops they signed. */
    support: {
      current: (merchantId: string) => c.get<{ session: adminApi.SupportSession | null }>(`/v1/support/merchants/${enc(merchantId)}/session`),
      start: (merchantId: string, reason: string) => c.post<adminApi.SupportSession>(`/v1/support/merchants/${enc(merchantId)}/session`, { reason }),
      end: (id: string) => c.post<adminApi.SupportSession>(`/v1/support/sessions/${enc(id)}/end`, {}),
    },
    rep: {
      leads: (q: Q = {}) => c.get<PageOf<repApi.Lead>>("/v1/rep/leads", { query: q }),
      lead: (id: string) => c.get<repApi.LeadDetail>(`/v1/rep/leads/${enc(id)}`),
      createLead: (body: Record<string, unknown>) => c.post<repApi.LeadDetail>("/v1/rep/leads", body),
      updateLead: (id: string, body: Record<string, unknown>) => c.patch<repApi.LeadDetail>(`/v1/rep/leads/${enc(id)}`, body),
      addActivity: (id: string, body: Record<string, unknown>) => c.post<repApi.LeadDetail>(`/v1/rep/leads/${enc(id)}/activities`, body),
      createMerchant: (body: repApi.RepCreateMerchantBody) => c.post<merchantApi.MerchantDetail>("/v1/rep/merchants", body),
      merchants: (q: Q = {}) => c.get<Items<repApi.RepMerchant>>("/v1/rep/merchants", { query: q }),
      qrKit: (merchantId: string) => c.get<merchantApi.QrKit>(`/v1/rep/merchants/${enc(merchantId)}/qr-kit`),
      checkIn: (merchantId: string, body: { day: 7 | 30; outcome?: string; notes?: string }) =>
        c.post<repApi.RepMerchant>(`/v1/rep/merchants/${enc(merchantId)}/check-ins`, body),
      commission: (q: Q = {}) => c.get<repApi.CommissionSummary>("/v1/rep/commission", { query: q }),
      today: () => c.get<repApi.RepToday>("/v1/rep/today"),
      streetDay: (q: Q = {}) => c.get<repApi.StreetDay>("/v1/rep/street-day", { query: q }),
      proof: (q: Q = {}) => c.get<repApi.PitchProof>("/v1/rep/proof", { query: q }),
      outcome: (leadId: string, body: repApi.LeadOutcomeBody) => c.post<{ status: "recorded" | "duplicate"; lead: repApi.LeadDetail }>(`/v1/rep/leads/${enc(leadId)}/outcome`, body),
      syncOutcomes: (items: (repApi.LeadOutcomeBody & { leadId: string })[]) => c.post<repApi.OutcomeSyncResult>("/v1/rep/outcomes/sync", { items }),
    },
    admin: {
      dashboard: () => c.get<adminApi.NetworkDashboard>("/v1/admin/dashboard"),
      onboardingFunnel: (days = 90) => c.get<adminApi.OnboardingFunnel>("/v1/admin/onboarding/funnel", { query: { days } }),
      overview: () => c.get<adminApi.AdminOverview>("/v1/admin/overview"),
      atRisk: () => c.get<{ items: adminApi.AtRiskShop[] }>("/v1/admin/at-risk"),
      costs: () => c.get<adminApi.AdminCosts>("/v1/admin/costs"),
      merchantMoney: (id: string) => c.get<adminApi.MerchantMoney>(`/v1/admin/merchants/${enc(id)}/money`),
      setChargeMode: (id: string, body: { chargeMode: "destination" | "direct"; reason: string }) => c.put<unknown>(`/v1/admin/merchants/${enc(id)}/charge-mode`, body),
      supportSessions: (q: Q = {}) => c.get<Items<adminApi.SupportSession>>("/v1/admin/support-sessions", { query: q }),
      startSupportSession: (merchantId: string, reason: string) => c.post<adminApi.SupportSession>(`/v1/admin/merchants/${enc(merchantId)}/support-sessions`, { reason }),
      endSupportSession: (id: string) => c.post<adminApi.SupportSession>(`/v1/admin/support-sessions/${enc(id)}/end`, {}),
      features: () => c.get<Items<adminApi.AdminFeature>>("/v1/admin/features"),
      setStage: (key: string, body: { stage: "hidden" | "beta" | "ga"; note?: string }) =>
        c.put<adminApi.AdminFeature>(`/v1/admin/features/${enc(key)}/stage`, body),
      overrides: (key: string) => c.get<Items<adminApi.FeatureOverride>>(`/v1/admin/features/${enc(key)}/overrides`),
      setOverride: (key: string, body: { merchantId: string; enabled: boolean; reason?: string }) =>
        c.put<Items<adminApi.FeatureOverride>>(`/v1/admin/features/${enc(key)}/overrides`, body),
      removeOverride: (key: string, merchantId: string) => c.delete<void>(`/v1/admin/features/${enc(key)}/overrides/${enc(merchantId)}`),
      plans: () => c.get<Items<adminApi.PlanAvailability>>("/v1/admin/plans"),
      neighbourhoods: () => c.get<Items<adminApi.AdminNeighbourhood>>("/v1/admin/neighbourhoods"),
      createNeighbourhood: (body: Record<string, unknown>) => c.post<adminApi.AdminNeighbourhood>("/v1/admin/neighbourhoods", body),
      updateNeighbourhood: (id: string, body: Record<string, unknown>) => c.patch<adminApi.AdminNeighbourhood>(`/v1/admin/neighbourhoods/${enc(id)}`, body),
      deleteNeighbourhood: (id: string) => c.delete<void>(`/v1/admin/neighbourhoods/${enc(id)}`),
      perks: (q: Q = {}) => c.get<Items<adminApi.NetworkPerk>>("/v1/admin/perks", { query: q }),
      createPerk: (body: Record<string, unknown>) => c.post<adminApi.NetworkPerk>("/v1/admin/perks", body),
      updatePerk: (id: string, body: Record<string, unknown>) => c.patch<adminApi.NetworkPerk>(`/v1/admin/perks/${enc(id)}`, body),
      deletePerk: (id: string) => c.delete<{ deleted: boolean; deactivated: boolean }>(`/v1/admin/perks/${enc(id)}`),
      merchants: (q: Q = {}) => c.get<PageOf<adminApi.AdminMerchant>>("/v1/admin/merchants", { query: q }),
      merchant: (id: string) => c.get<adminApi.AdminMerchantDetail>(`/v1/admin/merchants/${enc(id)}`),
      setMerchantStatus: (id: string, body: { status: adminApi.AdminMerchant["status"]; reason: string }) =>
        c.post<adminApi.AdminMerchantDetail>(`/v1/admin/merchants/${enc(id)}/status`, body),
      users: (q: Q = {}) => c.get<PageOf<adminApi.AdminUser>>("/v1/admin/users", { query: q }),
      setUserRole: (id: string, platformRole: "none" | "rep" | "admin") =>
        c.put<{ id: string; platformRole: string }>(`/v1/admin/users/${enc(id)}/role`, { platformRole }),
      audit: (q: Q = {}) => c.get<PageOf<adminApi.AuditEntry>>("/v1/admin/audit", { query: q }),
      ads: (q: Q = {}) => c.get<PageOf<adsApi.AdminAdCampaign>>("/v1/admin/ads", { query: q }),
      adReport: (id: string) => c.get<adsApi.AdReport>(`/v1/admin/ads/${enc(id)}/report`),
      approveAd: (id: string, note?: string) => c.post<adsApi.AdminAdCampaign>(`/v1/admin/ads/${enc(id)}/approve`, note ? { note } : {}),
      rejectAd: (id: string, reason: string) => c.post<adsApi.AdminAdCampaign>(`/v1/admin/ads/${enc(id)}/reject`, { reason }),
      markAdPaid: (id: string, paymentStatus: "paid" | "invoiced" = "paid") =>
        c.post<adsApi.AdminAdCampaign>(`/v1/admin/ads/${enc(id)}/mark-paid`, { paymentStatus }),
      markCampaignPaid: (id: string, paid = true) => c.post<campaignsApi.Campaign>(`/v1/admin/campaigns/${enc(id)}/mark-paid`, { paid }),
      drawCampaign: (id: string, redraw = false) => c.post<campaignsApi.DrawResult>(`/v1/admin/campaigns/${enc(id)}/draw`, { redraw }),
      campaignManagers: (q: Q = {}) => c.get<Items<campaignsApi.NeighbourhoodManager>>("/v1/admin/campaign-managers", { query: q }),
      addCampaignManager: (body: { neighbourhoodId: string; userId?: string; email?: string; phone?: string }) =>
        c.post<Items<campaignsApi.NeighbourhoodManager>>("/v1/admin/campaign-managers", body),
      removeCampaignManager: (neighbourhoodId: string, userId: string) =>
        c.delete<void>(`/v1/admin/campaign-managers/${enc(neighbourhoodId)}/${enc(userId)}`),
    },
    /** BIA campaigns (BIA managers: their neighbourhoods only; admins: all). */
    campaigns: {
      list: (q: Q = {}) => c.get<PageOf<campaignsApi.Campaign>>("/v1/campaigns", { query: q }),
      /** Neighbourhoods I manage (admins: all). Empty = not a BIA manager. */
      managedNeighbourhoods: () => c.get<Items<campaignsApi.ManagedNeighbourhood>>("/v1/me/neighbourhoods-managed"),
      /** Every shop on a strip (admin or that neighbourhood's manager), for shop pickers. */
      neighbourhoodMerchants: (neighbourhoodId: string) => c.get<Items<campaignsApi.NeighbourhoodMerchant>>(`/v1/admin/neighbourhoods/${enc(neighbourhoodId)}/merchants`),
      get: (id: string) => c.get<campaignsApi.Campaign>(`/v1/campaigns/${enc(id)}`),
      create: (body: Record<string, unknown>) => c.post<campaignsApi.Campaign>("/v1/campaigns", body),
      update: (id: string, body: Record<string, unknown>) => c.patch<campaignsApi.Campaign>(`/v1/campaigns/${enc(id)}`, body),
      schedule: (id: string) => c.post<campaignsApi.Campaign>(`/v1/campaigns/${enc(id)}/schedule`, {}),
      cancel: (id: string) => c.post<campaignsApi.Campaign>(`/v1/campaigns/${enc(id)}/cancel`, {}),
      addMerchant: (id: string, merchantId: string) => c.post<campaignsApi.Campaign>(`/v1/campaigns/${enc(id)}/merchants`, { merchantId }),
      removeMerchant: (id: string, merchantId: string) => c.delete<campaignsApi.Campaign>(`/v1/campaigns/${enc(id)}/merchants/${enc(merchantId)}`),
      report: (id: string) => c.get<campaignsApi.CampaignReport>(`/v1/campaigns/${enc(id)}/report`),
      /** BIA overview for one street (`from`/`to` are ISO instants; `to` is exclusive; default the last 30 days). */
      overview: (neighbourhoodId: string, q: { from?: string; to?: string } = {}) => c.get<campaignsApi.NeighbourhoodOverview>(`/v1/neighbourhoods/${enc(neighbourhoodId)}/overview`, { query: q }),
      /** Board report for a period. */
      periodReport: (neighbourhoodId: string, q: { from?: string; to?: string } = {}) => c.get<campaignsApi.NeighbourhoodReport>(`/v1/neighbourhoods/${enc(neighbourhoodId)}/report`, { query: q }),
      /** The same report as a CSV download (raw response). */
      periodReportCsv: (neighbourhoodId: string, q: { from?: string; to?: string } = {}) => c.request<Response>(`/v1/neighbourhoods/${enc(neighbourhoodId)}/report`, { query: { ...q, format: "csv" }, raw: true }),
    },
    ads: {
      rateCard: () => c.get<adsApi.AdRateCardResponse>("/v1/ads/rate-card", { anonymous: true }),
    },
    dev: {
      /** Dev/test only (FakePayments): docs/engineering/api/payments.md. */
      simulatePayment: (id: string, action: "succeed_payment" | "fail_payment" | "succeed_setup" = "succeed_payment") =>
        c.post<{ events: { id: string; type: string }[] }>("/v1/payments/fake/simulate", { action, id }, { anonymous: true }),
    },
  };
}

export type LlApi = ReturnType<typeof llApi>;

/** Counter calls under /v1/merchants/:id/counter; `headers` ride on every call (staff PIN token). */
function counterEndpoints(c: ApiClient, b: string, headers?: Record<string, string>) {
  const h = headers ? { headers } : {};
  return {
    lookup: (q: string) => c.get<staffApi.LookupResponse>(`${b}/counter/lookup`, { query: { q }, ...h }),
    award: (body: Omit<staffApi.AwardBody, "idempotencyKey">, idempotencyKey: string) =>
      c.post<staffApi.AwardResponse>(`${b}/counter/award`, { ...body, idempotencyKey }, { idempotencyKey, ...h }),
    redeem: (body: Omit<staffApi.RedeemBody, "idempotencyKey">, idempotencyKey: string) =>
      c.post<staffApi.CounterRedemptionResponse>(`${b}/counter/redeem`, { ...body, idempotencyKey }, { idempotencyKey, ...h }),
    verify: (code: string) => c.post<staffApi.CounterRedemptionResponse>(`${b}/counter/redemptions/verify`, { code }, h),
    today: (locationId?: string) => c.get<staffApi.TodayResponse>(`${b}/counter/today`, { query: { locationId }, ...h }),
    activity: (q: Q = {}) => c.get<staffApi.ActivityResponse>(`${b}/counter/activity`, { query: q, ...h }),
    undo: (transactionId: string, reason = "Undo at counter") =>
      c.post<staffApi.UndoResponse>(`${b}/counter/transactions/${enc(transactionId)}/undo`, { reason }, h),
  };
}

function merchantEndpoints(c: ApiClient, merchantId: string) {
  const b = `/v1/merchants/${enc(merchantId)}`;
  return {
    base: b,
    // Restaurant pack: tiffin, catering, banquet (restaurantOps.ts)
    ...restaurantOpsEndpoints(c, b),
    // Restaurant pack ordering: menu settings, pre-orders, kitchen display, split bills (restaurantKitchen.ts)
    ...restaurantKitchenEndpoints(c, b),
    // Repair and drop-off operations: board summary, phone approval, photos, invoices, rebooking, drop-off settings (serviceOps.ts)
    ...serviceOpsEndpoints(c, b),
    // Appointment calendar, price list, staff hours, checkout (appointments.ts)
    ...appointmentEndpoints(c, b),
    // Restaurant desk: Home, busy mode, phone lookup and balance reminders (restaurantDesk.ts)
    ...restaurantDeskEndpoints(c, b),
    // Restaurant customer pages, owner side: halal certification, private feedback actions (restaurantWeb.ts)
    ...restaurantWebEndpoints(c, b),
    detail: () => c.get<merchantApi.MerchantDetail>(b),
    update: (body: merchantApi.UpdateProfileBody) => c.patch<merchantApi.MerchantDetail>(b, body),
    onboarding: () => c.get<merchantApi.OnboardingChecklist>(`${b}/onboarding`),
    completeStep: (step: "profile" | "program" | "staff" | "qr_kit" | "pos") =>
      c.post<merchantApi.OnboardingChecklist>(`${b}/onboarding/complete`, { step }),
    dismissUpsell: () => c.post<merchantApi.OnboardingChecklist>(`${b}/onboarding/upsell/dismiss`, {}),
    setNudges: (enabled: boolean) => c.put<merchantApi.OnboardingChecklist>(`${b}/onboarding/nudges`, { enabled }),
    features: () => c.get<merchantApi.MerchantFeaturesResponse>(`${b}/features`),
    /** The free export window after a shop leaves (closed or back on Free): until is null when it does not apply. */
    exportWindow: () => c.get<{ leftAt: string | null; until: string | null }>(`${b}/customers/export-window`),
    notifyFeature: (key: string) => c.post<merchantApi.FeatureInterestResponse>(`${b}/features/${enc(key)}/notify`, {}),
    setBeta: (optIn: boolean) => c.put<merchantApi.MerchantFeaturesResponse>(`${b}/beta`, { optIn }),
    qrKit: () => c.get<merchantApi.QrKit>(`${b}/qr-kit`),
    apiKey: () => c.get<merchantApi.ApiKeyStatus>(`${b}/api-key`),
    createApiKey: () => c.post<merchantApi.ApiKeyCreated>(`${b}/api-key`, {}),
    deleteApiKey: () => c.delete<void>(`${b}/api-key`),
    // Locations + team
    locations: () => c.get<Items<merchantApi.Location>>(`${b}/locations`),
    createLocation: (body: Record<string, unknown>) => c.post<merchantApi.Location>(`${b}/locations`, body),
    updateLocation: (id: string, body: Record<string, unknown>) => c.patch<merchantApi.Location>(`${b}/locations/${enc(id)}`, body),
    deleteLocation: (id: string) => c.delete<void>(`${b}/locations/${enc(id)}`),
    rotateQr: (id: string) => c.post<merchantApi.Location>(`${b}/locations/${enc(id)}/rotate-qr`, {}),
    team: () => c.get<Items<merchantApi.StaffMember>>(`${b}/team`),
    invite: (body: { email?: string; phone?: string; name?: string; role: merchantApi.StaffRole }) => c.post<merchantApi.StaffMember>(`${b}/team`, body),
    setRole: (userId: string, role: merchantApi.StaffRole) => c.patch<merchantApi.StaffMember>(`${b}/team/${enc(userId)}`, { role }),
    /** Language and kitchen station for a team member (owner or manager). */
    setStaffProfile: (userId: string, body: { locale?: merchantApi.StaffMember["locale"]; station?: string | null }) => c.patch<merchantApi.StaffMember>(`${b}/team/${enc(userId)}`, body),
    removeStaff: (userId: string) => c.delete<void>(`${b}/team/${enc(userId)}`),
    setPin: (userId: string, pin: string) => c.put<void>(`${b}/team/${enc(userId)}/pin`, { pin }),
    // Program
    program: () => c.get<merchantApi.LoyaltyProgram>(`${b}/program`),
    updateProgram: (body: merchantApi.UpdateProgramBody) => c.patch<merchantApi.LoyaltyProgram>(`${b}/program`, body),
    rewards: () => c.get<Items<merchantApi.Reward>>(`${b}/rewards`),
    createReward: (body: Record<string, unknown>) => c.post<merchantApi.Reward>(`${b}/rewards`, body),
    updateReward: (id: string, body: Record<string, unknown>) => c.patch<merchantApi.Reward>(`${b}/rewards/${enc(id)}`, body),
    deleteReward: (id: string) => c.delete<{ deleted: boolean; archived: boolean }>(`${b}/rewards/${enc(id)}`),
    vipLevels: () => c.get<Items<merchantApi.VipLevel>>(`${b}/vip-levels`),
    createVipLevel: (body: Record<string, unknown>) => c.post<merchantApi.VipLevel>(`${b}/vip-levels`, body),
    updateVipLevel: (id: string, body: Record<string, unknown>) => c.patch<merchantApi.VipLevel>(`${b}/vip-levels/${enc(id)}`, body),
    deleteVipLevel: (id: string) => c.delete<void>(`${b}/vip-levels/${enc(id)}`),
    categories: () => c.get<Items<merchantApi.Category>>(`${b}/categories`),
    createCategory: (body: Record<string, unknown>) => c.post<merchantApi.Category>(`${b}/categories`, body),
    updateCategory: (id: string, body: Record<string, unknown>) => c.patch<merchantApi.Category>(`${b}/categories/${enc(id)}`, body),
    deleteCategory: (id: string) => c.delete<void>(`${b}/categories/${enc(id)}`),
    discountCards: () => c.get<Items<merchantApi.DiscountCard>>(`${b}/discount-cards`),
    createDiscountCard: (body: Record<string, unknown>) => c.post<merchantApi.DiscountCard>(`${b}/discount-cards`, body),
    updateDiscountCard: (id: string, body: Record<string, unknown>) => c.patch<merchantApi.DiscountCard>(`${b}/discount-cards/${enc(id)}`, body),
    deleteDiscountCard: (id: string) => c.delete<void>(`${b}/discount-cards/${enc(id)}`),
    promos: (status?: merchantApi.PromoStatus) => c.get<Items<merchantApi.Promo>>(`${b}/promos`, { query: { status } }),
    promo: (id: string) => c.get<merchantApi.Promo>(`${b}/promos/${enc(id)}`),
    createPromo: (body: Record<string, unknown>) => c.post<merchantApi.Promo>(`${b}/promos`, body),
    updatePromo: (id: string, body: Record<string, unknown>) => c.patch<merchantApi.Promo>(`${b}/promos/${enc(id)}`, body),
    setPromoStatus: (id: string, status: merchantApi.PromoStatus) => c.post<merchantApi.Promo>(`${b}/promos/${enc(id)}/status`, { status }),
    deletePromo: (id: string) => c.delete<void>(`${b}/promos/${enc(id)}`),
    // Customers
    customers: (q: Q = {}) => c.get<merchantApi.ListCustomersResponse>(`${b}/customers`, { query: q }),
    customerSegmentCounts: () => c.get<merchantApi.CustomerSegmentCounts>(`${b}/customers/segment-counts`),
    revealPhone: (memberId: string) => c.post<merchantApi.RevealPhoneResponse>(`${b}/customers/${enc(memberId)}/reveal-phone`, {}),
    customer: (memberId: string) => c.get<merchantApi.CustomerDetail>(`${b}/customers/${enc(memberId)}`),
    updateCustomer: (memberId: string, body: { notes?: string | null; tags?: string[] }) => c.patch<merchantApi.CustomerDetail>(`${b}/customers/${enc(memberId)}`, body),
    adjust: (memberId: string, body: { points: number; reason: string }, idempotencyKey: string) =>
      c.post<{ transaction: merchantApi.LedgerTransactionView; balance: number; duplicate: boolean }>(`${b}/customers/${enc(memberId)}/adjust`, body, { idempotencyKey }),
    activity: (q: Q = {}) => c.get<PageOf<merchantApi.ActivityItem>>(`${b}/activity`, { query: q }),
    reverse: (transactionId: string, reason: string) =>
      c.post<{ transaction: merchantApi.LedgerTransactionView; balance: number }>(`${b}/activity/${enc(transactionId)}/reverse`, { reason }),
    importCustomers: (body: { csv: string; dryRun: boolean; sourceName?: string }) => c.post<merchantApi.ImportCustomersResult>(`${b}/customers/import`, body),
    // Counter (staff.md)
    counter: counterEndpoints(c, b),
    /** The same counter calls made as the staff member who signed in with a PIN (BFF swaps the bearer for counter paths only). */
    counterAs: (staffToken: string) => counterEndpoints(c, b, { "x-counter-staff-token": staffToken }),
    /** POST staff-pin/verify: a 4-digit PIN identifies the staff member at a shared counter. */
    verifyStaffPin: (body: authApi.StaffPinVerifyBody) => c.post<authApi.StaffPinVerifyResponse>(`${b}/staff-pin/verify`, body),
    // Reports
    reports: {
      overview: (q: Q = {}) => c.get<reportsApi.OverviewReport>(`${b}/reports/overview`, { query: q }),
      daily: (q: Q = {}) => c.get<reportsApi.DailyReport>(`${b}/reports/daily`, { query: q }),
      topCustomers: (q: Q = {}) => c.get<reportsApi.TopCustomersReport>(`${b}/reports/top-customers`, { query: q }),
      rewards: (q: Q = {}) => c.get<reportsApi.RewardsReport>(`${b}/reports/rewards`, { query: q }),
      promos: () => c.get<reportsApi.PromosReport>(`${b}/reports/promos`),
      networkOverlap: () => c.get<reportsApi.NetworkOverlapReport>(`${b}/reports/network-overlap`),
      activation: () => c.get<reportsApi.ActivationReport>(`${b}/reports/activation`),
      today: () => c.get<reportsApi.TodayReportDto>(`${b}/reports/today`),
      heatmap: (weeks = 4) => c.get<reportsApi.HeatmapReport>(`${b}/reports/heatmap`, { query: { weeks } }),
      rewardsOwed: () => c.get<reportsApi.RewardsOwedReport>(`${b}/reports/rewards-owed`),
      retention: (months = 6) => c.get<reportsApi.RetentionReport>(`${b}/reports/retention`, { query: { months } }),
    },
    // Messaging
    messages: {
      audience: (body: { channel: messagingApi.Channel; segment: messagingApi.Segment }) => c.post<messagingApi.AudiencePreview>(`${b}/messages/audience`, body),
      list: (q: Q = {}) => c.get<PageOf<messagingApi.Message>>(`${b}/messages`, { query: q }),
      get: (id: string) => c.get<messagingApi.MessageDetail>(`${b}/messages/${enc(id)}`),
      create: (body: Record<string, unknown>) => c.post<messagingApi.MessageDetail>(`${b}/messages`, body),
      update: (id: string, body: Record<string, unknown>) => c.patch<messagingApi.MessageDetail>(`${b}/messages/${enc(id)}`, body),
      send: (id: string) => c.post<messagingApi.MessageDetail>(`${b}/messages/${enc(id)}/send`, {}),
      sendTest: (id: string) => c.post<messagingApi.TestSendResult>(`${b}/messages/${enc(id)}/test`, {}),
      cancel: (id: string) => c.post<messagingApi.MessageDetail>(`${b}/messages/${enc(id)}/cancel`, {}),
      remove: (id: string) => c.delete<void>(`${b}/messages/${enc(id)}`),
      smsUsage: () => c.get<messagingApi.SmsUsage>(`${b}/messages/sms-usage`),
      automations: () => c.get<Items<messagingApi.Automation>>(`${b}/automations`),
      saveAutomation: (kind: messagingApi.AutomationKind, body: messagingApi.UpsertAutomationBody) => c.put<messagingApi.Automation>(`${b}/automations/${kind}`, body),
    },
    // Integrations
    integrations: {
      list: () => c.get<integrationsApi.IntegrationListResponse>(`${b}/integrations`),
      get: (p: string) => c.get<integrationsApi.IntegrationDetail>(`${b}/integrations/${enc(p)}`),
      connect: (p: string, body: Record<string, string> = {}) => c.post<integrationsApi.ConnectResponse>(`${b}/integrations/${enc(p)}/connect`, body),
      update: (p: string, body: integrationsApi.UpdateSettingsBody) => c.patch<integrationsApi.IntegrationDetail>(`${b}/integrations/${enc(p)}`, body),
      disconnect: (p: string) => c.delete<integrationsApi.IntegrationSummary>(`${b}/integrations/${enc(p)}`),
      sync: (p: string) => c.post<integrationsApi.SyncResponse>(`${b}/integrations/${enc(p)}/sync`, {}),
      unmatched: (q: Q = {}) => c.get<PageOf<integrationsApi.UnmatchedPurchase>>(`${b}/integrations/unmatched`, { query: q }),
      attach: (eventId: string, body: { phone: string; name?: string }) => c.post<integrationsApi.ClaimResponse>(`${b}/integrations/unmatched/${enc(eventId)}/attach`, body),
      webhooks: () => c.get<{ items: integrationsApi.OutboundWebhook[]; events: string[] }>(`${b}/webhooks`),
      createWebhook: (body: { url: string; events: string[]; description?: string | null }) => c.post<integrationsApi.CreatedWebhook>(`${b}/webhooks`, body),
      updateWebhook: (id: string, body: Record<string, unknown>) => c.patch<integrationsApi.OutboundWebhook>(`${b}/webhooks/${enc(id)}`, body),
      deleteWebhook: (id: string) => c.delete<void>(`${b}/webhooks/${enc(id)}`),
      testWebhook: (id: string) => c.post<{ status: string; statusCode: number | null }>(`${b}/webhooks/${enc(id)}/test`, {}),
      deliveries: (id: string) => c.get<PageOf<integrationsApi.WebhookDelivery>>(`${b}/webhooks/${enc(id)}/deliveries`),
    },
    // Billing + Stripe Connect
    billing: {
      overview: () => c.get<billingApi.BillingOverviewResponse>(`${b}/billing`),
      checkout: (body: billingApi.CheckoutBody) => c.post<billingApi.CheckoutResponse>(`${b}/billing/checkout`, body),
      portal: (returnUrl?: string) => c.post<billingApi.UrlResponse>(`${b}/billing/portal`, returnUrl ? { returnUrl } : {}),
      cancel: () => c.post<{ subscription: billingApi.SubscriptionDto }>(`${b}/billing/cancel`, {}),
      resume: () => c.post<{ subscription: billingApi.SubscriptionDto }>(`${b}/billing/resume`, {}),
      paymentsStatus: () => c.get<billingApi.ConnectStatusResponse>(`${b}/payments/status`),
      paymentsConnect: (body: { returnUrl?: string; refreshUrl?: string } = {}) => c.post<billingApi.ConnectResponse>(`${b}/payments/connect`, body),
      // Restaurant pack subscriptions, add-ons, invoices
      restaurant: () => c.get<billingApi.RestaurantBillingResponse>(`${b}/billing/restaurant`),
      restaurantCheckout: (body: billingApi.RestaurantCheckoutBody) => c.post<billingApi.CheckoutResponse>(`${b}/billing/restaurant/checkout`, body),
      restaurantChange: (tier: billingApi.RestaurantChangeBody["tier"]) => c.post<billingApi.RestaurantSubscriptionResponse>(`${b}/billing/restaurant/change`, { tier }),
      restaurantCancel: (immediate = false) => c.post<billingApi.RestaurantSubscriptionResponse>(`${b}/billing/restaurant/cancel`, { immediate }),
      restaurantResume: () => c.post<billingApi.RestaurantSubscriptionResponse>(`${b}/billing/restaurant/resume`, {}),
      attachAddOn: (id: string, quantity = 1) => c.put<billingApi.AddOnResponse>(`${b}/billing/add-ons/${enc(id)}`, { quantity }),
      detachAddOn: (id: string) => c.delete<billingApi.AddOnResponse>(`${b}/billing/add-ons/${enc(id)}`),
      invoices: () => c.get<billingApi.InvoicesResponse>(`${b}/billing/invoices`),
    },
    // Phase 2: commerce (Plus) + service (Pro)
    catalog: () => c.get<commerceApi.CatalogResponse>(`${b}/catalog`),
    createItem: (body: commerceApi.CreateCatalogItemBody) => c.post<commerceApi.CatalogItemDto>(`${b}/catalog/items`, body),
    updateItem: (id: string, body: commerceApi.UpdateCatalogItemBody) => c.patch<commerceApi.CatalogItemDto>(`${b}/catalog/items/${enc(id)}`, body),
    archiveItem: (id: string) => c.delete<commerceApi.CatalogItemDto>(`${b}/catalog/items/${enc(id)}`),
    createCatalogCategory: (body: commerceApi.CreateCategoryBody) => c.post<commerceApi.CatalogCategoryDto>(`${b}/catalog/categories`, body),
    orders: (q: Q = {}) => c.get<PageOf<commerceApi.OrderDto>>(`${b}/orders`, { query: q }),
    setOrderStatus: (id: string, body: commerceApi.UpdateOrderStatusBody) => c.post<commerceApi.OrderDto>(`${b}/orders/${enc(id)}/status`, body),
    slots: (q: Q = {}) => c.get<PageOf<commerceApi.SlotDto>>(`${b}/slots`, { query: q }),
    generateSlots: (body: commerceApi.GenerateSlotsBody) => c.post<{ created: number; skipped: number; slots: commerceApi.SlotDto[] }>(`${b}/slots/generate`, body),
    deleteSlot: (id: string) => c.delete<void>(`${b}/slots/${enc(id)}`),
    bookings: (q: Q = {}) => c.get<PageOf<commerceApi.BookingDto>>(`${b}/bookings`, { query: q }),
    updateBooking: (id: string, status: "completed" | "no_show" | "cancelled") => c.patch<commerceApi.BookingDto>(`${b}/bookings/${enc(id)}`, { status }),
    tickets: (q: Q = {}) => c.get<PageOf<serviceApi.TicketDto>>(`${b}/tickets`, { query: q }),
    ticket: (id: string) => c.get<serviceApi.TicketDetailResponse>(`${b}/tickets/${enc(id)}`),
    createTicket: (body: serviceApi.CreateTicketBody) => c.post<serviceApi.TicketDetailResponse>(`${b}/tickets`, body),
    setTicketStatus: (id: string, body: serviceApi.TicketStatusBody) => c.post<serviceApi.TicketDetailResponse>(`${b}/tickets/${enc(id)}/status`, body),
    addTicketEvent: (id: string, body: serviceApi.TicketEventBody) => c.post<serviceApi.TicketEventDto>(`${b}/tickets/${enc(id)}/events`, body),
    createQuote: (ticketId: string, body: serviceApi.CreateQuoteBody) => c.post<serviceApi.QuoteDto>(`${b}/tickets/${enc(ticketId)}/quotes`, body),
    sendQuote: (quoteId: string) => c.post<serviceApi.QuoteDto>(`${b}/quotes/${enc(quoteId)}/send`, {}),
    createInvoice: (ticketId: string, body: serviceApi.CreateInvoiceBody) => c.post<serviceApi.InvoiceDto>(`${b}/tickets/${enc(ticketId)}/invoices`, body),
    markInvoicePaid: (id: string, method: "cash" | "card_terminal" | "etransfer" | "cheque" | "other") => c.post<serviceApi.InvoiceDto>(`${b}/invoices/${enc(id)}/mark-paid`, { method }),
    // Phase 3: ads + campaigns
    ads: (q: Q = {}) => c.get<PageOf<adsApi.AdCampaign>>(`${b}/ads`, { query: q }),
    ad: (id: string) => c.get<adsApi.AdCampaign>(`${b}/ads/${enc(id)}`),
    createAd: (body: Record<string, unknown>) => c.post<adsApi.AdCampaign>(`${b}/ads`, body),
    adReport: (id: string) => c.get<adsApi.AdReport>(`${b}/ads/${enc(id)}/report`),
    adAction: (id: string, action: "pause" | "resume" | "cancel") => c.post<adsApi.AdCampaign>(`${b}/ads/${enc(id)}/${action}`, {}),
    payAd: (id: string) => c.post<serviceApi.DepositPaymentDto>(`${b}/ads/${enc(id)}/pay`, {}),
    campaigns: () => c.get<Items<campaignsApi.MerchantCampaign>>(`${b}/campaigns`),
    joinCampaign: (id: string) => c.post<campaignsApi.MerchantCampaign>(`${b}/campaigns/${enc(id)}/join`, {}),
    leaveCampaign: (id: string) => c.delete<campaignsApi.MerchantCampaign>(`${b}/campaigns/${enc(id)}/join`),
    // Restaurant pack messaging: WhatsApp, reviews, festivals, phone orders
    whatsapp: {
      settings: () => c.get<whatsappApi.WhatsappSettings>(`${b}/whatsapp/settings`),
      saveSettings: (body: whatsappApi.WhatsappSettingsBody) => c.put<whatsappApi.WhatsappSettings>(`${b}/whatsapp/settings`, body),
      disconnect: () => c.delete<void>(`${b}/whatsapp/connection`),
      sessions: () => c.get<Items<whatsappApi.WhatsappSession>>(`${b}/whatsapp/sessions`),
      messages: (sessionId: string) => c.get<restaurantApi.ChatMessagesResponse>(`${b}/whatsapp/sessions/${enc(sessionId)}/messages`),
      sendMessage: (sessionId: string, text: string) => c.post<restaurantApi.ChatMessageDto>(`${b}/whatsapp/sessions/${enc(sessionId)}/messages`, { text }),
      takeOver: (sessionId: string) => c.post<restaurantApi.ChatMessagesResponse>(`${b}/whatsapp/sessions/${enc(sessionId)}/takeover`, {}),
      release: (sessionId: string) => c.post<restaurantApi.ChatMessagesResponse>(`${b}/whatsapp/sessions/${enc(sessionId)}/release`, {}),
      guest: (sessionId: string) => c.get<restaurantApi.ChatGuestPanel>(`${b}/whatsapp/sessions/${enc(sessionId)}/guest`),
      optIn: (body: whatsappApi.OptInBody) => c.post<whatsappApi.WhatsappConsent>(`${b}/whatsapp/opt-ins`, body),
      optOut: (phone: string) => c.post<whatsappApi.WhatsappConsent>(`${b}/whatsapp/opt-outs`, { phone }),
      broadcast: (body: whatsappApi.BroadcastBody) => c.post<whatsappApi.BroadcastResult>(`${b}/whatsapp/broadcasts`, body),
    },
    reviews: {
      list: (q: Q = {}) => c.get<PageOf<whatsappApi.ReviewDto>>(`${b}/reviews`, { query: q }),
      stats: () => c.get<whatsappApi.ReviewStats>(`${b}/reviews/stats`),
      saveSettings: (googleReviewUrl: string | null) => c.put<{ googleReviewUrl: string | null }>(`${b}/reviews/settings`, { googleReviewUrl }),
      request: (orderId: string) => c.post<whatsappApi.ReviewDto>(`${b}/reviews/requests`, { orderId }),
    },
    festivals: {
      upcoming: (days = 90) => c.get<FestivalsUpcoming>(`${b}/festivals/upcoming`, { query: { days } }),
      catalog: () => c.get<Items<FestivalCatalogEntry>>(`${b}/festivals`),
      setDateOverride: (festivalId: string, body: restaurantApi.FestivalDateOverrideBody) => c.put<{ festivalId: string; year: number; start: string; moved: boolean; shiftedMessages: number }>(`${b}/festivals/${enc(festivalId)}/date-override`, body),
      setCuisines: (cuisines: string[]) => c.put<{ cuisines: string[] }>(`${b}/festivals/preferences`, { cuisines }),
      addOccasion: (body: restaurantApi.CustomOccasionBody) => c.post<CustomOccasion>(`${b}/festivals/occasions`, body),
      removeOccasion: (id: string) => c.delete<{ ok: true }>(`${b}/festivals/occasions/${enc(id)}`),
      testSend: (festivalId: string, body: restaurantApi.FestivalTestBody) => c.post<restaurantApi.FestivalTestResult>(`${b}/festivals/${enc(festivalId)}/test-send`, body),
      createDraft: (festivalId: string, body: whatsappApi.FestivalDraftBody) => c.post<whatsappApi.FestivalDraftResult>(`${b}/festivals/${enc(festivalId)}/campaign-drafts`, body),
    },
    phone: {
      calls: (q: Q = {}) => c.get<PageOf<whatsappApi.PhoneCallDto>>(`${b}/phone/calls`, { query: q }),
      call: (id: string) => c.get<whatsappApi.PhoneCallDto>(`${b}/phone/calls/${enc(id)}`),
      confirm: (id: string, body: whatsappApi.ConfirmCallBody = {}) => c.post<{ call: whatsappApi.PhoneCallDto; order: commerceApi.OrderDto }>(`${b}/phone/calls/${enc(id)}/confirm`, body),
      discard: (id: string) => c.post<whatsappApi.PhoneCallDto>(`${b}/phone/calls/${enc(id)}/discard`, {}),
    },
  };
}

/** GET :m/festivals/upcoming (services/festivals.ts UpcomingFestivals). */
export interface FestivalsUpcoming {
  today: string;
  languages: string[];
  /** The shop's cuisine tags; empty means not set (nothing is hidden). */
  cuisines: string[];
  cuisineOptions: { id: string; label: string }[];
  items: (FestivalOccurrence & { templates: { id: string; label: string }[]; relevance: FestivalRelevance; sendStatus: restaurantApi.FestivalSendStatus[]; custom?: CustomOccasion })[];
}
/** GET :m/festivals (services/festivals.ts listFestivalCatalog). */
export interface FestivalCatalogEntry {
  id: string;
  name: string;
  tradition: FestivalTradition;
  approximate: boolean;
  dateNote: string;
  greeting: FestivalDef["greeting"];
  dates: FestivalDef["dates"];
  templates: FestivalTemplate[];
}

export type MerchantEndpoints = ReturnType<typeof merchantEndpoints>;
