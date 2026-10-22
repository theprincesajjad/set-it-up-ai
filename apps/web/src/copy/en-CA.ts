/**
 * UX copy (docs/design/ux-copy.md). Keys are stable so fr-CA can be added later.
 * `{brand}` is always BRAND.name from @ll/shared, never hard-coded.
 */
import { BRAND } from "@ll/shared";

export const copy = {
  action: {
    getStarted: "Get started",
    getStartedFree: "Get started free",
    textMeCode: "Text me a code",
    sendCode: "Send code",
    resend: "Resend code",
    done: "Done",
    join: (shop: string) => `Join ${shop}`,
    showCard: "Show my card",
    addToAppleWallet: "Add to Apple Wallet",
    addToGoogleWallet: "Add to Google Wallet",
    redeem: "Redeem",
    showCodeToStaff: "Show code to staff",
    getNewCode: "Get a new code",
    directions: "Directions",
    call: "Call",
    notifyMe: "Notify me",
    learnMore: "Learn more",
    tryAgain: "Try again",
    getTheApp: "Get the app",
  },
  err: {
    otpWrong: "That code didn't match. Try again.",
    otpExpired: "That code expired. We sent you a new one.",
    otpTooMany: "Too many tries. Try again in 10 minutes.",
    network: "Can't connect right now. Check your connection and try again.",
    server: "Something went wrong on our end. Try again in a moment.",
    sessionExpired: "For your security, please sign in again.",
    qrInvalid: "This QR code isn't active. Ask staff for help.",
    linkInvalid: (shop: string) => `This link doesn't work anymore. Contact ${shop}.`,
    quoteExpired: (date: string, shop: string) => `This quote expired on ${date}. Ask ${shop} for a new one.`,
    paymentDeclined: "Your card was declined. Try another card or payment method.",
    required: (field: string) => `${field} is required.`,
    redeemNotEnough: (terminology: string, n: number) => `Not enough ${terminology} yet. ${n} more to go.`,
    locationDenied: "Turn on location to see what's closest, or pick your neighbourhood.",
  },
  ok: {
    joined: (firstName: string) => `You're in, ${firstName}.`,
    joinedBonus: (bonus: string, shop: string) => `You're in. ${bonus} added at ${shop.replace(/\.$/, "")}.`,
    welcomeBack: (firstName: string) => `Welcome back, ${firstName}.`,
    consentOff: (shop: string) => `Done. ${shop} won't send you offers.`,
    consentOn: (shop: string) => `You'll get offers from ${shop}. Change this anytime.`,
    muted: (shop: string, terminology: string) => `${shop} is muted. Your ${terminology} still work.`,
    dataRequested: "Requested. We'll send your file within 24 hours.",
    saved: "Saved",
    quoteApproved: (shop: string) => `Approved. We've let ${shop} know.`,
    paid: (pts: string, shop: string) => `Paid. You earned ${pts} at ${shop}.`,
  },
  empty: {
    wallet: { title: "Your shops will live here", body: "Show your card at any shop on the map to start earning.", action: "Show my card" },
    noNeighbourhood: { title: "We're not on your street yet", body: "We launch one neighbourhood at a time. Want us in yours?", action: "Suggest my street" },
    rewardsReady: { title: "No rewards yet", body: "Keep visiting your shops. We'll tell you the moment one's ready.", action: "See how close you are" },
    activity: (terminology: string) => ({ title: "Nothing here yet", body: `Your ${terminology} and rewards will show up here after your first visit.`, action: "Find shops nearby" }),
    mapSearch: (q: string) => ({ title: `No shops match "${q}"`, body: "Try another word, or zoom out.", action: "Clear search" }),
  },
  soon: {
    badge: "Coming soon",
    notified: "We'll let you know",
    pricingNote:
      "Paid tools switch on once enough shops are on the network, so every feature launches with customers already using the app.",
    pricingPromise: "Our promise: your loyalty program and its reports are free forever. They will never move to a paid plan.",
    planAvailable: (plan: string, price: string) => `Available on ${plan} · ${price}/mo`,
  },
  ad: {
    label: "Sponsored",
    whyTitle: "Why you're seeing this",
    whyBody: (shop: string, street: string, terminology = "points") =>
      `${shop} paid to show this offer to people near ${street}. Sponsored posts never change your ${terminology}.`,
    a11yPrefix: "Sponsored.",
  },
  consent: {
    /** consent.merchant.v2 (canvas Join) — shown next to an UNCHECKED checkbox and sent verbatim as consent.text. */
    merchantVersion: "consent.merchant.v2",
    merchant: (shop: string) => `Send me offers from ${shop} by text or email. Optional. Unsubscribe any time.`,
    /** consent.merchant.caption.v1 */
    merchantCaption: (shop: string, shopAddress: string, contact: string) =>
      `Messages come from ${shop}${shopAddress ? `, ${shopAddress}` : ""}${contact ? `, ${contact}` : ""}, sent via ${BRAND.name}. Reply STOP or tap unsubscribe in any message, or change it in Settings.`,
  },
  misc: {
    pointsNeverExpire: (terminology: string) => `Your ${terminology} never expire.`,
    stampsToGo: (n: number, reward: string) => `${n} more for a ${reward.charAt(0).toLowerCase()}${reward.slice(1)}`,
    ptsToGo: (n: number, reward: string) => `${n} pts to ${reward}`,
    showAtCounter: "Show this at the counter",
    freeForever: "Free forever · No transaction fees · Unlimited locations",
    madeInToronto: "Made in Toronto",
    joinTagline: "One card for every shop on your street.",
    openUntil: (time: string) => `Open · closes ${time}`,
    closedUntil: (time: string) => `Closed · opens ${time}`,
    pharmacyRule: "Prescriptions and pharmacy services don't earn points, as Ontario rules require.",
  },
  ticketStatus: {
    intake: "Dropped off",
    diagnosing: "Diagnosing",
    quote_sent: "Quote ready",
    approved: "Approved",
    in_progress: "Work started",
    waiting_parts: "Waiting for parts",
    ready: "Ready for pickup",
    picked_up: "Picked up",
    declined: "Quote declined",
    cancelled: "Cancelled",
  } as Record<string, string>,
  orderStatus: {
    pending: "Order sent",
    accepted: "Accepted",
    preparing: "Being prepared",
    ready: "Ready for pickup",
    picked_up: "Picked up",
    cancelled: "Cancelled",
    refunded: "Refunded",
  } as Record<string, string>,
} as const;

export type Copy = typeof copy;
