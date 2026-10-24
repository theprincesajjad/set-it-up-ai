// API contract for the "wallet" area (Apple Wallet + Google Wallet network pass).
// Owned by the integrations team (routes/wallet). Docs: docs/engineering/api/wallet.md

/** QR payload on every pass and in the app: "LL:<memberCode>". */
export const MEMBER_QR_PREFIX = "LL:";
export const memberQrValue = (memberCode: string) => `${MEMBER_QR_PREFIX}${memberCode}`;

export interface WalletShopBalance {
  merchantId: string;
  name: string;
  balance: number;
  terminology: string;
  /** Null = points never expire. Otherwise months of inactivity before expiry (disclosed on the pass). */
  expiryMonths: number | null;
  // Added with the v2 pass (always sent by the API; optional so older fixtures still type-check).
  /** Rewards this balance can redeem right now (shop's own units; never summed across shops on screen). */
  rewardsReady?: number;
  /** Shop slug for deep links (ll://shop/<slug>). */
  slug?: string;
  lastVisitAt?: string | null;
}

export interface WalletSummary {
  memberCode: string;
  qrValue: string;
  name: string | null;
  shopCount: number;
  /**
   * @deprecated Sums points and stamps across shops, which mixes units. Not shown on the pass any more;
   * use `rewardsReady` (the v2 headline) and per-shop balances.
   */
  totalPoints: number;
  /** Rewards ready across all shops (the pass headline). Always sent by the API (optional for older fixtures). */
  rewardsReady?: number;
  /** Ordered: shops with rewards ready first, then most recent visit. */
  shops: WalletShopBalance[];
  /** The shopper's language (en, hi, ur, pa): the pass text is written in it. Absent = English. */
  locale?: "en" | "hi" | "ur" | "pa";
}

/** Brand wording for the wallet buttons (Apple / Google brand guidelines). */
export const WALLET_BUTTON_TEXT = { apple: "Add to Apple Wallet", google: "Add to Google Wallet" } as const;

/** GET /v1/me/wallet */
export interface WalletStatusResponse {
  summary: WalletSummary;
  apple: { available: boolean; downloadUrl: string | null; reason: string | null };
  google: { available: boolean; saveUrl: string | null; reason: string | null };
}

/** GET /v1/me/wallet/google */
export interface GoogleSaveResponse {
  saveUrl: string;
}

/** GET /v1/me/wallet/apple/link — short-lived URL Safari can open directly ("Add to Apple Wallet"). */
export interface AppleLinkResponse {
  url: string;
  expiresAt: string;
}
