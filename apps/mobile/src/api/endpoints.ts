/**
 * One typed function per documented endpoint the app uses. Request/response
 * types come from packages/shared/src/api/* (the contract the API teams own);
 * paths follow docs/engineering/api/*.md.
 */
import type {
  adsApi,
  appointmentsApi,
  authApi,
  campaignsApi,
  classesApi,
  commerceApi,
  customerApi,
  integrationsApi,
  merchantApi,
  networkApi,
  restaurantApi,
  serviceApi,
  staffApi,
  tiffinApi,
  walletApi,
  whatsappApi,
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
      /** "Forgot to scan?": claim a POS purchase by its receipt code (integrations.md). */
      claimPurchase: (merchantId: string, code: string) => c.post<integrationsApi.ClaimResponse>("/v1/me/purchases/claim", { merchantId, code }),
      campaigns: (lat?: number, lng?: number) => c.get<{ items: campaignsApi.MyCampaign[] }>("/v1/me/campaigns", { query: { lat, lng } }),
    },

    /** Inbox + per-type preferences (packages/shared customerApi notifications, docs/engineering/api/notifications.md). */
    notifications: {
      list: (q: { limit?: number; cursor?: string; unread?: boolean } = {}) =>
        c.get<customerApi.NotificationsResponse>("/v1/me/notifications", { query: { limit: q.limit ?? 30, cursor: q.cursor, unread: q.unread ? "1" : undefined } }),
      read: (id: string) => c.post<customerApi.NotificationsReadResponse>(`/v1/me/notifications/${enc(id)}/read`),
      readAll: () => c.post<customerApi.NotificationsReadResponse>("/v1/me/notifications/read-all"),
      prefs: () => c.get<customerApi.NotificationPrefsResponse>("/v1/me/notification-prefs"),
      updatePrefs: (body: customerApi.UpdateNotificationPrefsBody) => c.put<customerApi.NotificationPrefsResponse>("/v1/me/notification-prefs", body),
    },

    wallet: {
      status: () => c.get<walletApi.WalletStatusResponse>("/v1/me/wallet"),
      appleLink: () => c.get<walletApi.AppleLinkResponse>("/v1/me/wallet/apple/link"),
      google: () => c.get<walletApi.GoogleSaveResponse>("/v1/me/wallet/google"),
    },

    network: {
      neighbourhoods: () => c.get<networkApi.NeighbourhoodsResponse>("/v1/network/neighbourhoods", { auth: "optional" }),
      neighbourhood: (slug: string) => c.get<networkApi.NeighbourhoodDetailResponse>(`/v1/network/neighbourhoods/${enc(slug)}`, { auth: "optional" }),
      shops: (q: { lat?: number; lng?: number; neighbourhood?: string; vertical?: string; q?: string; radiusMetres?: number; halal?: "1" | "all"; limit?: number; cursor?: string }) =>
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

    /** Appointments (booking.appointments): book a stylist and a time, with a deposit or a card on file. */
    appointments: {
      services: (slug: string) => c.get<appointmentsApi.PublicServicesResponse>(`/v1/public/shops/${enc(slug)}/services`, { auth: "optional" }),
      availability: (slug: string, q: { serviceIds: string[]; staffId: string; from: string; to: string }) =>
        c.get<appointmentsApi.AvailabilityResponse>(`/v1/public/shops/${enc(slug)}/availability`, { query: { serviceIds: q.serviceIds.join(","), staffId: q.staffId, from: q.from, to: q.to }, auth: "optional" }),
      mine: () => c.get<appointmentsApi.MyAppointmentsResponse>("/v1/me/appointments"),
      get: (id: string) => c.get<appointmentsApi.MyAppointmentResponse>(`/v1/me/appointments/${enc(id)}`),
      book: (body: appointmentsApi.CreateMyAppointmentBody) => c.post<appointmentsApi.CreateMyAppointmentResponse>("/v1/me/appointments", body),
      cancel: (id: string) => c.post<appointmentsApi.MyAppointmentChangeResponse>(`/v1/me/appointments/${enc(id)}/cancel`, {}),
      reschedule: (id: string, body: appointmentsApi.RescheduleMyAppointmentBody) => c.post<appointmentsApi.MyAppointmentChangeResponse>(`/v1/me/appointments/${enc(id)}/reschedule`, body),
    },

    /** Classes and memberships (booking.classes, memberships.recurring): the studio's schedule and the person's passes. Same routes as the web pages. */
    classes: {
      studio: (slug: string) => c.get<classesApi.PublicClassesResponse>(`/v1/public/shops/${enc(slug)}/classes`, { auth: "optional" }),
      mine: (merchantId?: string) => c.get<classesApi.MyClassesResponse>("/v1/me/classes", { query: { merchantId } }),
      book: (body: { sessionId: string; use?: "auto" | "drop_in"; waitlist?: boolean }) => c.post<classesApi.BookClassResponse>("/v1/me/classes/bookings", body),
      cancelBooking: (id: string) => c.post<classesApi.CancelBookingResponse>(`/v1/me/classes/bookings/${enc(id)}/cancel`, {}),
      buyPack: (productId: string) => c.post<classesApi.PurchaseResponse>("/v1/me/classes/purchases", { productId }),
      agreement: (productId: string, startDate?: string) => c.get<classesApi.AgreementDto>(`/v1/me/classes/products/${enc(productId)}/agreement`, { query: { startDate } }),
      join: (body: { productId: string; agreementHash: string; startDate?: string }) => c.post<classesApi.JoinMembershipResponse>("/v1/me/classes/memberships", { ...body, acceptAgreement: true }),
      freeze: (id: string, days: number) => c.post<classesApi.MembershipChangeResponse>(`/v1/me/classes/memberships/${enc(id)}/freeze`, { days }),
      cancelMembership: (id: string, reason?: string) => c.post<classesApi.MembershipChangeResponse>(`/v1/me/classes/memberships/${enc(id)}/cancel`, { reason }),
      keepMembership: (id: string) => c.post<classesApi.MembershipChangeResponse>(`/v1/me/classes/memberships/${enc(id)}/keep`, {}),
      declineRenewal: (id: string) => c.post<classesApi.MembershipChangeResponse>(`/v1/me/classes/memberships/${enc(id)}/decline-renewal`, {}),
      payMembership: (id: string) => c.post<classesApi.PurchaseResponse>(`/v1/me/classes/memberships/${enc(id)}/pay`, {}),
      cardSetup: (id: string) => c.post<classesApi.MembershipSetupResponse>(`/v1/me/classes/memberships/${enc(id)}/card`, {}),
    },

    commerce: {
      /** 402 feature_locked when order-ahead isn't enabled for the shop: the app hides the entry point. */
      menu: (slug: string) => c.get<commerceApi.PublicMenuResponse>(`/v1/public/shops/${enc(slug)}/menu`, { auth: "optional" }),
      slots: (slug: string, q: { kind?: commerceApi.SlotKind; locationId?: string; from?: string; to?: string } = {}) =>
        c.get<{ items: commerceApi.SlotDto[] }>(`/v1/public/shops/${enc(slug)}/slots`, { query: q, auth: "optional" }),
      /** Drop-off bookings (booking.dropoff_scheduling): book a time to bring an item in, and cancel it. */
      bookSlot: (body: commerceApi.CreateBookingBody) => c.post<commerceApi.BookingDto>("/v1/me/bookings", body),
      cancelBooking: (bookingId: string) => c.post<commerceApi.BookingDto>(`/v1/me/bookings/${enc(bookingId)}/cancel`),
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
      publicApproveQuote: (token: string, signatureName: string) =>
        c.post<serviceApi.ApproveQuoteResponse>(`/v1/public/quotes/${enc(token)}/approve`, { signatureName }, { auth: "none" }),
      publicDeclineQuote: (token: string, reason?: string) => c.post<serviceApi.ApproveQuoteResponse>(`/v1/public/quotes/${enc(token)}/decline`, { reason }, { auth: "none" }),
      payInvoice: (invoiceId: string) => c.post<serviceApi.PayInvoiceResponse>(`/v1/me/invoices/${enc(invoiceId)}/pay`),
    },

    /** Restaurant pack, customer side (docs/engineering/restaurant-endpoints.md). A 402 means the shop has the feature off. */
    tiffin: {
      plans: (slug: string, q: { lang?: string; menuDays?: number } = {}) =>
        c.get<tiffinApi.PublicPlansResponse>(`/v1/public/shops/${enc(slug)}/tiffin/plans`, { query: q, auth: "optional" }),
      subscribe: (body: tiffinApi.SubscribeBody, idempotencyKey: string) =>
        c.post<tiffinApi.SubscribeResponse>("/v1/me/tiffin/subscriptions", body, { idempotencyKey }),
      subscriptions: (status?: string) => c.get<tiffinApi.MySubscriptionsResponse>("/v1/me/tiffin/subscriptions", { query: { status } }),
      subscription: (subId: string) => c.get<tiffinApi.MySubscriptionDetailResponse>(`/v1/me/tiffin/subscriptions/${enc(subId)}`),
      update: (subId: string, body: tiffinApi.UpdateMySubscriptionBody) => c.patch<tiffinApi.MySubscriptionDto>(`/v1/me/tiffin/subscriptions/${enc(subId)}`, body),
      upcoming: (q: { days?: number; subscriptionId?: string } = {}) => c.get<tiffinApi.UpcomingResponse>("/v1/me/tiffin/upcoming", { query: q }),
      skip: (subId: string, dates: string[]) => c.post<tiffinApi.SkipResponse>(`/v1/me/tiffin/subscriptions/${enc(subId)}/skips`, { dates }),
      unskip: (subId: string, date: string) => c.del<tiffinApi.MySubscriptionDto>(`/v1/me/tiffin/subscriptions/${enc(subId)}/skips/${enc(date)}`),
      pause: (subId: string, body: tiffinApi.PauseBody) => c.post<tiffinApi.PauseResponse>(`/v1/me/tiffin/subscriptions/${enc(subId)}/pause`, body),
      resume: (subId: string) => c.post<tiffinApi.MySubscriptionDto>(`/v1/me/tiffin/subscriptions/${enc(subId)}/resume`),
      cancel: (subId: string, reason?: string) => c.post<tiffinApi.MySubscriptionDto>(`/v1/me/tiffin/subscriptions/${enc(subId)}/cancel`, { reason }),
      retryPayment: (subId: string) => c.post<tiffinApi.RetryPaymentResponse>(`/v1/me/tiffin/subscriptions/${enc(subId)}/retry-payment`),
      /** Change the card on file: a SetupIntent, confirmed on the web page /pay/setup/<id>?cs=. */
      paymentMethod: (subId: string) => c.post<tiffinApi.PaymentMethodSetupResponse>(`/v1/me/tiffin/subscriptions/${enc(subId)}/payment-method`),
    },

    catering: {
      /** Signed in: the event shows up in My events. */
      inquire: (body: restaurantApi.CateringInquiryBody & { merchantId: string }) => c.post<restaurantApi.CateringEventDto>("/v1/me/catering", body),
      events: () => c.get<{ items: restaurantApi.CateringEventDto[]; nextCursor: string | null }>("/v1/me/catering"),
      event: (eventId: string) => c.get<restaurantApi.CateringEventDto>(`/v1/me/catering/${enc(eventId)}`),
      /** The link in the shop's quote message (/e/<token>). */
      publicEvent: (token: string) => c.get<restaurantApi.PublicCateringResponse>(`/v1/public/catering/${enc(token)}`, { auth: "none" }),
    },

    banquet: {
      halls: (slug: string) => c.get<{ items: restaurantApi.HallDto[]; nextCursor: string | null }>(`/v1/public/shops/${enc(slug)}/banquet/halls`, { auth: "optional" }),
      availability: (slug: string, q: { from: string; to: string; hallId?: string }) =>
        c.get<restaurantApi.HallAvailabilityResponse>(`/v1/public/shops/${enc(slug)}/banquet/availability`, { query: q, auth: "optional" }),
      hold: (body: restaurantApi.CreateHoldBody) => c.post<restaurantApi.HoldResponse>("/v1/me/banquet/holds", body),
      bookings: () => c.get<{ items: restaurantApi.HallBookingDto[]; nextCursor: string | null }>("/v1/me/banquet/bookings"),
      booking: (bookingId: string) => c.get<{ booking: restaurantApi.HallBookingDto; deposit: restaurantApi.CateringDepositPaymentDto | null }>(`/v1/me/banquet/bookings/${enc(bookingId)}`),
      cancel: (bookingId: string) => c.post<restaurantApi.HallBookingDto>(`/v1/me/banquet/bookings/${enc(bookingId)}/cancel`),
    },

    whatsapp: {
      consent: (merchantId: string) => c.get<whatsappApi.WhatsappConsent>(`/v1/me/merchants/${enc(merchantId)}/whatsapp-consent`),
      setConsent: (merchantId: string, body: { optIn: boolean; language?: whatsappApi.WaLanguage }) =>
        c.put<whatsappApi.WhatsappConsent>(`/v1/me/merchants/${enc(merchantId)}/whatsapp-consent`, body),
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
      verifyRedemption: (merchantId: string, code: string, frontStoreOnly?: boolean) =>
        c.post<staffApi.CounterRedemptionResponse>(`${counter(merchantId)}/redemptions/verify`, { code, ...(frontStoreOnly ? { frontStoreOnly } : {}) }, { auth: "staff" }),
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

    /** Restaurant pack, staff side: kitchen display (restaurant.kds) and the counter tender choice (restaurant.dual_pricing). */
    kitchen: {
      features: (merchantId: string) => c.get<merchantApi.MerchantFeaturesResponse>(`${m(merchantId)}/features`, { auth: "staff" }),
      tickets: (merchantId: string, q: { station?: string; lang?: restaurantApi.MenuLang } = {}) =>
        c.get<restaurantApi.KitchenTicketsResponse>(`${m(merchantId)}/kitchen/tickets`, { query: q, auth: "staff", timeoutMs: 8000 }),
      setItem: (merchantId: string, itemId: string, status: "cooking" | "ready") =>
        c.patch<restaurantApi.KitchenTicketDto>(`${m(merchantId)}/kitchen/items/${enc(itemId)}`, { status }, { auth: "staff" }),
      bump: (merchantId: string, orderId: string) => c.post<restaurantApi.KitchenTicketDto>(`${m(merchantId)}/kitchen/orders/${enc(orderId)}/bump`, {}, { auth: "staff" }),
      recall: (merchantId: string, orderId: string) => c.post<restaurantApi.KitchenTicketDto>(`${m(merchantId)}/kitchen/orders/${enc(orderId)}/recall`, {}, { auth: "staff" }),
      dualPricing: (merchantId: string) => c.get<restaurantApi.DualPricingResponse>(`${m(merchantId)}/dual-pricing`, { auth: "staff" }),
      catalog: (merchantId: string) => c.get<commerceApi.CatalogResponse>(`${m(merchantId)}/catalog`, { auth: "staff" }),
      counterOrder: (merchantId: string, body: restaurantApi.CounterOrderBody, idempotencyKey: string) =>
        c.post<commerceApi.OrderDto>(`${m(merchantId)}/orders/counter`, body, { auth: "staff", idempotencyKey }),
    },
  };
}
