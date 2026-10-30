// API contract for the "wallet" area (Apple Wallet + Google Wallet): the network pass and the shop cards.
// Owned by the wallet team (routes/wallet). Docs: docs/engineering/api/wallet.md, setup: docs/engineering/wallet.md
import { z } from "zod";

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

/**
 * Brand wording for the wallet buttons (Apple / Google brand guidelines). Google's approved label is "Add to Google Wallet"
 * ("Save to Google Wallet" is no longer an approved label).
 */
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

// ---------------------------------------------------------------------------
// Shop cards: one Apple + Google card per membership, branded by the shop.
// ---------------------------------------------------------------------------
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Settings, Wallet card (PUT /v1/merchants/:id/wallet-card). Every key optional; {} is the default card. */
export const walletCardSchema = z
  .object({
    color: z.string().regex(HEX, "Use a hex colour like #0B0B0C").optional(),
    strip: z.enum(["stamps", "plain"]).optional(),
    rewardText: z.string().trim().max(40).optional(),
    showHours: z.boolean().optional(),
    showBooking: z.boolean().optional(),
    terms: z.string().trim().max(500).optional(),
  })
  .strict();
export type WalletCardSettings = z.infer<typeof walletCardSchema>;

/** Stamp strip: at most this many circles; bigger goals (and points programs) show a progress bar. */
export const STRIP_MAX_STAMPS = 12;

/** Everything a shop card shows, computed by the API. The web preview renders the same model. */
export interface ShopPassModel {
  merchantId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  /** Card colours (#rrggbb): background, text, labels. Text and labels are picked for contrast. */
  colors: { background: string; foreground: string; label: string };
  strip: "stamps" | "plain";
  /** stamps = a stamp card (goal = stamps per reward); points = a balance towards the next reward. */
  kind: "stamps" | "points";
  terminology: string;
  balance: number;
  /** Stamps per card, or the cost of the next reward (0 = no reward set up yet). */
  goal: number;
  /** Stamps on the current card (balance mod goal for stamps; balance for points, capped at goal). */
  filled: number;
  nextReward: { name: string; cost: number; left: number } | null;
  rewardsReady: number;
  memberName: string | null;
  memberCode: string;
  qrValue: string;
  /** The next confirmed appointment at this shop, if any. */
  nextAppointment: { startsAt: string; endsAt: string; label: string } | null;
  /** Back of card. */
  hours: string | null;
  bookingUrl: string | null;
  shopUrl: string;
  terms: string | null;
  /** Where the shop is, as the public may see it: the street address for a storefront, "Bloor West area" for a home studio, the city for a mobile pro. */
  place: string | null;
  timezone: string;
  locale: "en" | "hi" | "ur" | "pa";
}

export interface WalletPlatformStatus {
  /** The server can issue this card (credentials set). False: hide the button, show "coming soon". */
  available: boolean;
  /** Apple: a 10-minute signed .pkpass link. Google: the save link. Null when unavailable. */
  url: string | null;
  /** The customer has this card in that wallet (Apple: a device is registered; Google: a save callback, not removed since). */
  added: boolean;
}

/** GET /v1/me/wallet/shops/:merchantId */
export interface ShopWalletResponse {
  merchantId: string;
  apple: WalletPlatformStatus;
  google: WalletPlatformStatus;
}

/** GET /v1/wallet/availability (public): which wallets this server can issue. Drives "coming soon" before sign-in. */
export interface WalletAvailability {
  apple: boolean;
  google: boolean;
}

/** GET /v1/merchants/:id/wallet-card and PUT (body: WalletCardSettings). */
export interface WalletCardResponse {
  settings: WalletCardSettings;
  /** A sample member's card with the shop's settings (member "Priya", 4 stamps or a sample balance). */
  preview: ShopPassModel;
  availability: WalletAvailability;
  /** Customers carrying this shop's card right now. */
  cardsInWallets: { apple: number; google: number };
}
