/**
 * Copy library (docs/design/ux-copy.md). Keys are stable so fr-CA can be added
 * later as src/copy/fr-CA.ts with the same shape. `{placeholders}` are
 * interpolated by t(). `{brand}` always comes from BRAND.name.
 */
import { BRAND } from "@ll/shared";

export const enCA = {
  // Actions
  "action.getStarted": "Get started",
  "action.sendCode": "Send code",
  "action.resend": "Resend code",
  "action.resendIn": "Resend in {time}",
  "action.done": "Done",
  "action.join": "Join {shop}",
  "action.showCard": "Show my card",
  "action.addToAppleWallet": "Add to Apple Wallet",
  "action.addToGoogleWallet": "Add to Google Wallet",
  "action.redeem": "Redeem",
  "action.showCodeToStaff": "Show code to staff",
  "action.getNewCode": "Get a new code",
  "action.directions": "Directions",
  "action.call": "Call",
  "action.notifyMe": "Notify me",
  "action.learnMore": "Learn more",
  "action.tryAgain": "Try again",
  "action.retryNow": "Retry now",
  "action.notNow": "Not now",
  "action.turnOn": "Turn on",
  "action.cancel": "Cancel",
  "action.back": "Back",
  "action.share": "Share",
  "action.website": "Website",
  "counter.findCustomer": "Find customer",
  "counter.scanCard": "Scan card",
  "counter.enterCode": "Code",
  "counter.addAndAward": "Add and award",
  "counter.confirmRedeem": "Confirm redeem",
  "counter.undo": "Undo ({seconds})",
  "counter.switchStaff": "Switch",
  "counter.searchLast4": "Search last 4",
  "counter.placeholder": "Customer's phone number",
  "counter.redeemNow": "Redeem now",
  "destructive.deleteAccount": "Delete my account",

  // Errors
  "err.phone.incomplete": "Enter a 10-digit mobile number.",
  "err.phone.invalid": "That doesn't look like a Canadian or US mobile number. Check the area code.",
  "err.otp.wrong": "That code didn't match. Try again.",
  "err.otp.expired": "That code expired. We sent you a new one.",
  "err.otp.tooMany": "Too many tries. Try again in 10 minutes.",
  "err.network": "Can't connect right now. Check your connection and try again.",
  "err.server": "Something went wrong on our end. Try again in a moment.",
  "err.sessionExpired": "For your security, please sign in again.",
  "err.redeem.expired": "This code expired. Your points weren't used.",
  "err.redeem.otherShop": "This code is for {shop}.",
  "err.redeem.used": "Already redeemed at {time}.",
  "err.redeem.notEnough": "Not enough {terminology} yet. {n} more to go.",
  "err.redeem.offline": "Redeem needs internet. Awards still work.",
  "err.redeem.offlineCustomer": "You're offline. Reconnect to redeem.",
  "err.award.duplicate": "Couldn't add for ...{last4}: it was already added.",
  "err.award.programPaused": "Your program is paused. Ask the owner to resume it.",
  "err.award.memberBlocked": "This customer can't earn here. Ask a manager.",
  "err.pin.wrong": "Wrong PIN. Try again.",
  "err.pin.locked": "Too many tries. Wait 2 minutes or ask a manager.",
  "err.camera.denied": "Camera is off. Turn it on in Settings, or type the number instead.",
  "err.location.denied": "Turn on location to see what's closest, or pick your neighbourhood.",
  "err.qr.invalid": "This QR code isn't active. Ask staff for help.",
  "err.quote.expired": "This quote expired on {date}. Ask {shop} for a new one.",
  "err.form.required": "{fieldLabel} is required.",
  "err.counter.badNumber": "Check the number. It needs 10 digits.",

  // Success
  "ok.joined": "You're in, {firstName}.",
  "ok.joinedBonus": "You're in. {bonus} added at {shop}.",
  "ok.welcomeBack": "Welcome back, {firstName}.",
  "ok.counter.offlineSaved": "Saved. Will send when you're back online.",
  "ok.counter.undone": "Undone. {firstName} is back to {pts}.",
  "ok.counter.redeemed": "{reward} redeemed. Hand it over.",
  "ok.redeem.customer": "Enjoy your {reward}. Confirmed by staff.",
  "ok.online": "Back online. All {n} sent.",
  "ok.consent.off": "Done. {shop} won't send you offers.",
  "ok.consent.on": "You'll get offers from {shop}. Change this anytime.",
  "ok.muted": "{shop} is muted. Your {terminology} still work.",
  "ok.unmuted": "{shop} is unmuted.",
  "ok.dataRequested": "Requested. We'll send your file within 24 hours.",
  "ok.saved": "Saved",
  "ok.quoteApproved": "Approved. We've let {shop} know.",

  // Empty states
  "empty.wallet.title": "Your shops will live here",
  "empty.wallet.body": "Show your card at any shop on the map and your first points land here.",
  "empty.noNeighbourhood.title": "We're not on your street yet",
  "empty.noNeighbourhood.body": "We launch one neighbourhood at a time. Want us in yours?",
  "empty.rewardsReady.title": "No rewards ready yet",
  "empty.rewardsReady.body": "Keep collecting at your shops. We'll tell you the moment a reward is ready.",
  "empty.rewardsReady.action": "See your shops",
  "empty.activity.title": "Nothing here yet",
  "empty.activity.body": "Your {terminology} and rewards will show up here after your first visit.",
  "empty.activity.action": "Find shops nearby",
  "empty.orders.title": "No orders or repairs yet",
  "empty.orders.body": "When you order ahead or drop something off, you can follow it here.",
  "empty.mapSearch.title": "No shops match \"{query}\"",
  "empty.mapSearch.body": "Try another word, or zoom out.",
  "empty.counter": "Enter a number or scan a card",
  "empty.campaigns.title": "No passport running nearby",
  "empty.campaigns.body": "When your neighbourhood runs a passport or points weekend, your progress shows up here.",

  // Coming soon
  "soon.badge": "Coming soon",
  "soon.orderAhead": "Order-ahead. Order and pay before you arrive, and get a text when it's ready.",
  "soon.notified": "We'll let you know",

  // Sponsored
  "ad.label": "Sponsored",
  "ad.why.title": "Why you're seeing this",
  "ad.why.body": "{shop} paid to show this offer to people near {street}. Sponsored posts never change your {terminology}.",
  "ad.why.link": "Ad settings",
  "ad.a11yPrefix": "Sponsored.",

  // CASL consent (ux-copy § 7). Version ids are sent/stored with the exact text.
  "consent.global.v1": "Send me offers and news from shops I join, by text and email. I can unsubscribe anytime.",
  "consent.global.caption": "Each shop is named in every message. You can turn this off for any shop in Settings.",
  "consent.platform.v1": "Send me {brand} news and neighbourhood events by email. I can unsubscribe anytime.",
  "consent.merchant.caption.v1": "Messages come from {shop}, sent via {brand}. Reply STOP or tap unsubscribe in any message, or change it in Settings.",
  /** When the consent sentence itself already explains STOP / unsubscribe (marketingConsentText), name the sender only. */
  "consent.merchant.sender": "Messages come from {shop}, sent via {brand}.",
  "consent.push.title": "Know when you've earned a reward",
  "consent.push.body": "We'll only notify you about your points, rewards and orders. Offers are off unless you turn them on.",
  "consent.withdrawn": "Done. {shop} won't send you offers. Your {terminology} keep working.",

  // Misc
  "misc.pointsNeverExpire": "Your {terminology} never expire.",
  "misc.stampsToGo": "{n} more for a {reward}",
  "misc.ptsToGo": "{n} pts to {reward}",
  "misc.balanceAfter": "Your balance after: {pts}",
  "misc.showAtCounter": "Show this at the counter",
  "misc.offlineCardWorks": "You're offline. Your card still works.",
  "misc.offlineQueue": "Offline · {n} waiting to send",
  "misc.updatedAgo": "Updated {relativeTime}",
  "misc.joinTagline": "One card for every shop on your street.",
  "misc.freeForever": "Free forever · No subscription, no fee on loyalty · Unlimited locations",
  "misc.pharmacyRule": "Prescriptions and pharmacy services don't earn points, as Ontario rules require.",
} as const;

export type CopyKey = keyof typeof enCA;

/** Interpolate `{name}` placeholders; `{brand}` defaults to BRAND.name. */
export function t(key: CopyKey, vars: Record<string, string | number | null | undefined> = {}): string {
  const all: Record<string, string | number | null | undefined> = { brand: BRAND.name, ...vars };
  return enCA[key].replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = all[name];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Version ids for CASL records. */
export const CONSENT_VERSIONS = { global: "consent.global.v1", platform: "consent.platform.v1", merchant: "consent.merchant.v1" } as const;
