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
}

export interface WalletSummary {
  memberCode: string;
  qrValue: string;
  name: string | null;
  shopCount: number;
  totalPoints: number;
  shops: WalletShopBalance[];
}

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
