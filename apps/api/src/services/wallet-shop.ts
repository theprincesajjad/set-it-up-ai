/**
 * Shop cards: one Apple Wallet + Google Wallet card per membership, in the shop's own look (docs/engineering/wallet.md).
 *
 *   front   shop logo + name, the trade colour, the stamp strip ("4 of 6") or a progress bar, the next reward,
 *           the member's name, the next appointment, and the member QR (LL:<memberCode>, the same code the counter
 *           already scans, so stamping works unchanged)
 *   back    hours, booking link, where (privacy-safe), terms, how it works, updates note
 *
 * Updates: every balance change (ledger listener "wallet_shop_pass"), appointment change (appointments services call
 * `notifyShopPassUpdate`) and wallet card edit (`refreshShopCards`) rebuilds the card. Apple: bump last_updated_at +
 * an APNs push (device then fetches the latest pass); Google: PATCH the loyalty object (class on a card edit).
 *
 * Privacy (packages/shared/src/address-privacy.ts): a home-based (`area`) or travelling (`city`) shop never puts a street
 * address or a pin on the card. `place` is the public line ("Bloor West area") and there are no locations at all.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { appointments, locations, loyaltyPrograms, merchantMembers, merchants, rewards, services, users, walletDeviceRegistrations, walletPasses, type WalletCardSettings } from "@ll/db";
import { BRAND, LOCALES, addressVisibilityOf, normalizeLocale, publicPlaceLine, t as translate, unitLabel, unitWord, walletApi, type Locale, type MessageKey } from "@ll/shared";
import type { Config } from "../config.js";
import type { AppContext } from "../context.js";
import { hmacSha256, randomToken, safeEqual } from "../lib/crypto.js";
import { HttpError, notFound } from "../lib/errors.js";
import { httpFor, type Fetch } from "./integrations-http.js";
import { registerBalanceListener } from "./ledger.js";
import { apnsFor } from "./wallet-apns.js";
import { appleSignerFromConfig, manifestFor, passTypeIdOf, signManifest, type AppleSigner, type PassLocation } from "./wallet-apple.js";
import { accessToken, googleCreds, googleHttp, WALLET_API } from "./wallet-google.js";
import { isPharmacy } from "./pharmacy-guard.js";
import { encodePng, hexToRgb, walletAsset } from "./wallet-png.js";
import { stripImages, stripQuery, type StripInput } from "./wallet-strip.js";
import { zipSync } from "fflate";
import { requestJson } from "../connectors/util.js";

type Platform = "apple" | "google";
export type ShopPass = typeof walletPasses.$inferSelect;
export type ShopPassModel = walletApi.ShopPassModel;

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
const HEX = /^#[0-9a-fA-F]{6}$/;
const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const mix = (a: string, b: string, t: number) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

/** Card colours from the shop's choice: dark text on a light card, light text on a dark one; labels a quieter mix. */
export function cardColors(background: string | null | undefined): ShopPassModel["colors"] {
  const bg = (background && HEX.test(background) ? background : "#0B0B0C").toUpperCase();
  const fg = contrast(bg, "#FFFFFF") >= contrast(bg, "#111111") ? "#FFFFFF" : "#111111";
  return { background: bg, foreground: fg, label: mix(fg, bg, 0.28) };
}

export const rgbOf = (hex: string) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
};

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** "Mon 9:00–17:00" lines in the reader's language (weekday names from Intl). */
export function formatHours(hours: Record<string, [string, string][]> | null | undefined, locale: Locale): string | null {
  if (!hours || !Object.keys(hours).length) return null;
  const fmt = new Intl.DateTimeFormat(LOCALES[locale].bcp47, { weekday: "short", timeZone: "UTC" });
  // 2024-01-01 was a Monday.
  return DAY_KEYS.map((k, i) => {
    const day = fmt.format(new Date(Date.UTC(2024, 0, 1 + i)));
    const ranges = hours[k] ?? [];
    return `${day} ${ranges.length ? ranges.map(([a, b]) => `${a}–${b}`).join(", ") : translate(locale, "sh.wcard.closed")}`;
  }).join("\n");
}

interface ShopRow {
  merchant: typeof merchants.$inferSelect;
  program: typeof loyaltyPrograms.$inferSelect | null;
  rewards: { name: string; cost: number }[];
  locs: (typeof locations.$inferSelect)[];
  bookable: boolean;
}

async function loadShop(ctx: AppContext, merchantId: string): Promise<ShopRow> {
  const [merchant] = await ctx.db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (!merchant || merchant.status === "closed") throw notFound("Shop");
  const [program] = await ctx.db.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.merchantId, merchantId)).limit(1);
  const rw = await ctx.db
    .select({ name: rewards.name, cost: rewards.pointsCost })
    .from(rewards)
    .where(and(eq(rewards.merchantId, merchantId), eq(rewards.active, true)))
    .orderBy(asc(rewards.pointsCost), asc(rewards.sortOrder));
  const locs = await ctx.db.select().from(locations).where(and(eq(locations.merchantId, merchantId), eq(locations.active, true))).orderBy(asc(locations.createdAt));
  const [svc] = await ctx.db.select({ id: services.id }).from(services).where(and(eq(services.merchantId, merchantId), eq(services.active, true), eq(services.kind, "appointment"))).limit(1);
  return { merchant, program: program ?? null, rewards: rw, locs, bookable: !!svc };
}

/**
 * Up to 10 pins for lock-screen / geo relevance: only storefront (`exact`) locations with a pin. A home studio (`area`) or a
 * travelling pro (`city`) gets none: even the offset area pin would put a home on a lock-screen map.
 */
export function shopPassLocations(shop: { name: string }, locs: { addressVisibility: string; lat: number | null; lng: number | null }[], locale: Locale): PassLocation[] {
  return locs
    .filter((l) => addressVisibilityOf(l.addressVisibility) === "exact" && l.lat != null && l.lng != null)
    .slice(0, 10)
    .map((l) => ({ latitude: Number(l.lat!.toFixed(6)), longitude: Number(l.lng!.toFixed(6)), relevantText: translate(locale, "sh.pass.nearby", { shop: shop.name }) }));
}

/** The line a card may show for where the shop is: the address for a storefront, the area or city otherwise. Never more. */
export function shopPassPlace(locs: { addressVisibility: string; areaLabel: string | null; city: string | null; address: string }[]): string | null {
  const l = locs[0];
  return l ? publicPlaceLine(l) : null;
}

interface ModelInput {
  shop: ShopRow;
  balance: number;
  memberName: string | null;
  memberCode: string;
  locale: Locale;
  nextAppointment: ShopPassModel["nextAppointment"];
  /** Settings to preview instead of the saved ones (Settings, Wallet card, unsaved draft). */
  settings?: WalletCardSettings;
}

export function buildShopModel(config: Pick<Config, "publicWebUrl">, i: ModelInput): ShopPassModel {
  const { merchant: m, program, rewards: rw, locs } = i.shop;
  const s: WalletCardSettings = i.settings ?? (m.walletCard as WalletCardSettings) ?? {};
  const kind: ShopPassModel["kind"] = program?.earnType === "stamps" && (program.stampGoal ?? 0) > 0 ? "stamps" : "points";
  const terminology = program?.terminology ?? (kind === "stamps" ? "stamps" : "points");
  const next = rw.find((r) => r.cost > i.balance) ?? null;
  const ready = rw.filter((r) => r.cost <= i.balance).length;
  const first = rw[0] ?? null;
  const rewardName = s.rewardText?.trim() || (kind === "stamps" ? first?.name : (next ?? first)?.name) || null;
  let goal: number;
  let filled: number;
  if (kind === "stamps") {
    goal = program!.stampGoal;
    // A full card that hasn't been redeemed yet shows full, not empty.
    filled = i.balance >= goal ? goal : i.balance % goal;
  } else {
    goal = (next ?? rw[rw.length - 1])?.cost ?? 0;
    filled = Math.min(i.balance, goal);
  }
  const nextReward = rewardName ? { name: rewardName, cost: kind === "stamps" ? goal : (next ?? first)!.cost, left: Math.max(0, (kind === "stamps" ? goal : (next ?? first)!.cost) - (kind === "stamps" ? filled : i.balance)) } : null;
  const web = config.publicWebUrl.replace(/\/$/, "");
  return {
    merchantId: m.id,
    slug: m.slug,
    name: m.name,
    logoUrl: m.logoUrl,
    colors: cardColors(s.color ?? m.brandColor),
    strip: s.strip ?? "stamps",
    kind,
    terminology,
    balance: i.balance,
    goal,
    filled,
    nextReward,
    rewardsReady: ready,
    memberName: i.memberName,
    memberCode: i.memberCode,
    qrValue: walletApi.memberQrValue(i.memberCode),
    nextAppointment: i.nextAppointment,
    hours: s.showHours === false ? null : formatHours(locs[0]?.hours, i.locale),
    bookingUrl: s.showBooking === false || !i.shop.bookable ? null : `${web}/shops/${m.slug}/book`,
    shopUrl: `${web}/shops/${m.slug}`,
    terms: s.terms?.trim() || program?.termsText?.trim() || null,
    place: shopPassPlace(locs),
    timezone: m.timezone,
    locale: i.locale,
  };
}

/** The customer's next confirmed appointment at the shop (booked or arrived, no unpaid hold), if any. */
export async function nextAppointmentFor(ctx: AppContext, userId: string, merchantId: string): Promise<ShopPassModel["nextAppointment"]> {
  const [a] = await ctx.db
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt, items: appointments.items })
    .from(appointments)
    .where(and(eq(appointments.merchantId, merchantId), eq(appointments.userId, userId), inArray(appointments.status, ["booked", "arrived"]), isNull(appointments.holdExpiresAt), gte(appointments.endsAt, ctx.now())))
    .orderBy(asc(appointments.startsAt))
    .limit(1);
  if (!a) return null;
  // A pharmacy visit never goes on the card: it would bring a pharmacy card up on the lock screen at the visit time (the same rule
  // keeps the shop and service out of its reminders).
  const [m] = await ctx.db.select({ vertical: merchants.vertical }).from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  if (isPharmacy(m)) return null;
  return { startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), label: a.items.map((x) => x.name).join(", ").slice(0, 80) };
}

/** The member's card, or 404 when they aren't a member of the shop. */
export async function shopPassModel(ctx: AppContext, userId: string, merchantId: string): Promise<{ model: ShopPassModel; locations: PassLocation[] }> {
  const shop = await loadShop(ctx, merchantId);
  const [row] = await ctx.db
    .select({ balance: merchantMembers.balance, memberLocale: merchantMembers.locale, name: users.name, memberCode: users.memberCode, locale: users.locale, deletedAt: users.deletedAt })
    .from(merchantMembers)
    .innerJoin(users, eq(users.id, merchantMembers.userId))
    .where(and(eq(merchantMembers.userId, userId), eq(merchantMembers.merchantId, merchantId)))
    .limit(1);
  // A client who booked but never joined gets the card too (0 so far): scanning it at the counter makes them a member.
  const nextAppointment = await nextAppointmentFor(ctx, userId, merchantId);
  let who = row;
  if (!who && nextAppointment) {
    const [u] = await ctx.db.select({ name: users.name, memberCode: users.memberCode, locale: users.locale, deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).limit(1);
    if (u) who = { ...u, balance: 0, memberLocale: null };
  }
  if (!who || who.deletedAt) throw notFound("Membership");
  const locale = normalizeLocale(who.memberLocale) ?? normalizeLocale(who.locale) ?? "en";
  const model = buildShopModel(ctx.config, { shop, balance: who.balance, memberName: who.name, memberCode: who.memberCode, locale, nextAppointment });
  return { model, locations: shopPassLocations(shop.merchant, shop.locs, locale) };
}

/** Settings preview: the shop's card for a sample member ("Priya", mid-way to the reward), with draft settings if given. */
export async function sampleShopModel(ctx: AppContext, merchantId: string, settings?: WalletCardSettings): Promise<ShopPassModel> {
  const shop = await loadShop(ctx, merchantId);
  const stamps = shop.program?.earnType === "stamps" && (shop.program.stampGoal ?? 0) > 0;
  const goal = stamps ? shop.program!.stampGoal : (shop.rewards[0]?.cost ?? 100);
  const balance = stamps ? Math.max(1, Math.min(goal - 1, Math.round(goal * 0.6))) : Math.round(goal * 0.6);
  const start = new Date(ctx.now().getTime() + 3 * 86_400_000);
  start.setUTCHours(15, 0, 0, 0);
  return buildShopModel(ctx.config, {
    shop,
    balance,
    memberName: "Priya",
    memberCode: "K7Q2M9",
    locale: "en",
    nextAppointment: shop.bookable ? { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 45 * 60_000).toISOString(), label: "Appointment" } : null, // l10n-ok: owner preview sample
    settings: settings ?? (shop.merchant.walletCard as WalletCardSettings),
  });
}

// ---------------------------------------------------------------------------
// Pass rows
// ---------------------------------------------------------------------------
export async function getOrCreateShopPass(ctx: AppContext, userId: string, merchantId: string, platform: Platform): Promise<ShopPass> {
  const where = and(eq(walletPasses.userId, userId), eq(walletPasses.platform, platform), eq(walletPasses.merchantId, merchantId));
  const [existing] = await ctx.db.select().from(walletPasses).where(where).limit(1);
  if (existing) return existing;
  const [created] = await ctx.db
    .insert(walletPasses)
    .values({ userId, merchantId, platform, serialNumber: `${platform === "apple" ? "S" : "T"}${randomToken(15)}`, authToken: randomToken(24), lastUpdatedAt: ctx.now() })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await ctx.db.select().from(walletPasses).where(where).limit(1);
  return again!;
}

// ---------------------------------------------------------------------------
// Apple
// ---------------------------------------------------------------------------
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
const trFor = (loc: Locale) => (key: MessageKey, vars?: Record<string, string | number>) => translate(loc, key, vars);

export const stripInputOf = (m: ShopPassModel): StripInput => ({ kind: m.kind, filled: m.filled, goal: m.goal, background: m.colors.background, foreground: m.colors.foreground });

/** "4 of 6" (stamps) or "120 points" (points). */
export function balanceLine(m: ShopPassModel): string {
  const tr = trFor(m.locale);
  return m.kind === "stamps" ? tr("sh.wcard.ofGoal", { n: m.filled, goal: m.goal }) : unitLabel(m.locale, m.terminology, m.balance);
}

export function rewardLine(m: ShopPassModel): string {
  const tr = trFor(m.locale);
  if (!m.nextReward) return tr("sh.wcard.noReward");
  return m.nextReward.left <= 0 || (m.kind === "stamps" && m.filled >= m.goal) ? tr("sh.wcard.ready", { reward: m.nextReward.name }) : tr("sh.wcard.toGo", { reward: m.nextReward.name, n: m.nextReward.left });
}

/** pass.json for a shop card. `p` = the signer's ids (the real Pass Type ID, or the fake one in dev). */
export function buildShopPassJson(config: Pick<Config, "publicApiUrl">, p: { passTypeId: string; teamId: string }, pass: { serialNumber: string; authToken: string }, m: ShopPassModel, locs: PassLocation[]) {
  const loc = m.locale;
  const tr = trFor(loc);
  const unit = cap(unitWord(loc, m.terminology));
  const stripOn = m.strip === "stamps";
  const appt = m.nextAppointment;
  const back: Record<string, unknown>[] = [];
  if (appt) back.push({ key: "visitBack", label: tr("sh.wcard.nextVisit"), value: appt.label || appt.startsAt, ...(appt.label ? {} : { dateStyle: "PKDateStyleFull", timeStyle: "PKDateStyleShort" }) });
  if (m.hours) back.push({ key: "hours", label: tr("sh.wcard.hours"), value: m.hours });
  if (m.bookingUrl) back.push({ key: "book", label: tr("sh.wcard.book"), value: m.bookingUrl, attributedValue: `<a href='${m.bookingUrl}'>${tr("sh.wcard.book")}</a>` });
  if (m.place) back.push({ key: "where", label: tr("sh.wcard.where"), value: m.place });
  back.push({ key: "shop", label: m.name, value: m.shopUrl, attributedValue: `<a href='${m.shopUrl}'>${tr("sh.wcard.shopPage", { shop: m.name })}</a>` });
  back.push({ key: "how", label: tr("sh.pass.howLabel"), value: tr("sh.wcard.how", { shop: m.name, unit: unitWord(loc, m.terminology) }) });
  if (m.terms) back.push({ key: "terms", label: tr("sh.pass.terms"), value: m.terms });
  back.push({ key: "code", label: tr("sh.pass.codeLabel"), value: m.memberCode });
  back.push({ key: "updates", label: tr("sh.pass.updatesLabel"), value: tr("sh.wcard.updates") });
  back.push({ key: "support", label: tr("sh.pass.support"), value: BRAND.supportEmail, attributedValue: `<a href='mailto:${BRAND.supportEmail}'>${BRAND.supportEmail}</a>` });

  return {
    formatVersion: 1,
    passTypeIdentifier: p.passTypeId,
    serialNumber: pass.serialNumber,
    teamIdentifier: p.teamId,
    webServiceURL: `${config.publicApiUrl}/v1/wallet/apple`,
    authenticationToken: pass.authToken,
    organizationName: m.name,
    description: tr("sh.wcard.description", { shop: m.name }),
    logoText: truncate(m.name, 24),
    foregroundColor: rgbOf(m.colors.foreground),
    backgroundColor: rgbOf(m.colors.background),
    labelColor: rgbOf(m.colors.label),
    sharingProhibited: true,
    suppressStripShine: true,
    // The next appointment makes the card come up on the lock screen around it (relevantDates on iOS 18+, relevantDate before).
    ...(appt
      ? {
          relevantDate: new Date(new Date(appt.startsAt).getTime() - 60 * 60_000).toISOString(),
          relevantDates: [{ startDate: new Date(new Date(appt.startsAt).getTime() - 2 * 60 * 60_000).toISOString(), endDate: appt.endsAt }],
        }
      : {}),
    // Storefronts only (privacy rule: home and mobile shops never carry a pin).
    ...(locs.length ? { locations: locs.slice(0, 10), maxDistance: 150 } : {}),
    barcodes: [{ format: "PKBarcodeFormatQR", message: m.qrValue, messageEncoding: "iso-8859-1", altText: m.memberCode }],
    userInfo: { merchantId: m.merchantId },
    storeCard: {
      headerFields: [{ key: "balance", label: unit, value: balanceLine(m), textAlignment: "PKTextAlignmentRight", changeMessage: tr("sh.wcard.changeBalance", { unit }) }],
      // With the stamp strip the stamps are the picture; the plain card shows the count big instead.
      primaryFields: stripOn ? [] : [{ key: "big", label: m.kind === "stamps" ? unit : tr("sh.wcard.nextReward"), value: m.kind === "stamps" ? balanceLine(m) : rewardLine(m) }],
      secondaryFields: [
        { key: "reward", label: tr("sh.wcard.nextReward"), value: rewardLine(m), changeMessage: tr("sh.wcard.changeReward") },
        { key: "member", label: tr("sh.wcard.member"), value: truncate(m.memberName ?? m.memberCode, 20), textAlignment: "PKTextAlignmentRight" },
      ],
      auxiliaryFields: appt
        ? [{ key: "visit", label: tr("sh.wcard.nextVisit"), value: appt.startsAt, dateStyle: "PKDateStyleMedium", timeStyle: "PKDateStyleShort", changeMessage: tr("sh.wcard.changeVisit") }]
        : [],
      backFields: back,
    },
  };
}

// Logo: the shop's image when it is (or can be made) a PNG, else the shop name alone (logoText) next to the colour icon.
const logoCache = new Map<string, { at: number; png: Buffer | null }>();
type SharpLike = (input: Buffer) => { resize: (w: number | null, h: number, o: object) => { png: () => { toBuffer: () => Promise<Buffer> } } };
let sharpLoader: Promise<SharpLike | null> | null = null;
const loadSharp = () =>
  (sharpLoader ??= import(/* optional at runtime */ "sharp" as string)
    .then((m: { default?: unknown }) => (m.default ?? m) as SharpLike)
    .catch(() => null));

/** Fetch the logo (3 s, ≤ 2 MB), as PNG at 150 px tall (@3x of the 50 pt logo box). Null on any failure. */
export async function logoPngFor(logoUrl: string | null, fetchImpl: Fetch, now = Date.now()): Promise<Buffer | null> {
  if (!logoUrl || !/^https:\/\//i.test(logoUrl)) return null;
  const hit = logoCache.get(logoUrl);
  if (hit && now - hit.at < 6 * 60 * 60_000) return hit.png;
  let png: Buffer | null = null;
  try {
    const r = await fetchImpl(logoUrl, { signal: AbortSignal.timeout(3000), redirect: "follow" });
    const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    if (buf && buf.length <= 2_000_000) {
      const sharp = await loadSharp();
      if (sharp) png = await sharp(buf).resize(null, 150, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      else if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) png = buf;
    }
  } catch {
    png = null;
  }
  if (logoCache.size > 500) logoCache.clear();
  logoCache.set(logoUrl, { at: now, png });
  return png;
}

/** Icon (lock screen, notifications): the card colour with a ring in the text colour, at 29/58/87 px. */
function shopIcon(size: number, bg: string, fg: string): Buffer {
  const [br, bgc, bb] = hexToRgb(bg);
  const [fr, fgc, fb] = hexToRgb(fg);
  const c = size / 2;
  return encodePng(size, size, (x, y) => {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
    const a = Math.max(0, Math.min(1, (0.1 - Math.abs(d - 0.52)) * c));
    return [Math.round(br + (fr - br) * a), Math.round(bgc + (fgc - bgc) * a), Math.round(bb + (fb - bb) * a), 255];
  });
}

export function shopPassImages(m: ShopPassModel, logo: Buffer | null): Record<string, Buffer> {
  const files: Record<string, Buffer> = {
    "icon.png": shopIcon(29, m.colors.background, m.colors.foreground),
    "icon@2x.png": shopIcon(58, m.colors.background, m.colors.foreground),
    "icon@3x.png": shopIcon(87, m.colors.background, m.colors.foreground),
  };
  if (logo) Object.assign(files, { "logo.png": logo, "logo@2x.png": logo, "logo@3x.png": logo });
  if (m.strip === "stamps") Object.assign(files, stripImages(stripInputOf(m)));
  return files;
}

export async function buildShopPkpass(ctx: AppContext, signer: AppleSigner, pass: Pick<ShopPass, "serialNumber" | "authToken">, m: ShopPassModel, locs: PassLocation[], signingTime?: Date): Promise<{ buffer: Buffer; files: Record<string, Buffer>; manifest: Buffer }> {
  const logo = await logoPngFor(m.logoUrl, httpFor(ctx));
  const files: Record<string, Buffer> = { "pass.json": Buffer.from(JSON.stringify(buildShopPassJson(ctx.config, signer, pass, m, locs))), ...shopPassImages(m, logo) };
  const manifest = manifestFor(files);
  const signature = signManifest(manifest, signer, signingTime);
  return { buffer: Buffer.from(zipSync({ ...files, "manifest.json": manifest, signature }, { level: 6 })), files, manifest };
}

export async function shopPassBuffer(ctx: AppContext, pass: ShopPass): Promise<Buffer> {
  const signer = appleSignerFromConfig(ctx.config);
  if (!signer) throw new HttpError(503, "wallet_not_configured", "Apple Wallet cards aren't available on this server yet.");
  const { model, locations: locs } = await shopPassModel(ctx, pass.userId, pass.merchantId!);
  return (await buildShopPkpass(ctx, signer, pass, model, locs)).buffer;
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------
const hexId = (uuid: string) => uuid.replace(/-/g, "");
export const shopClassId = (issuerId: string, merchantId: string) => `${issuerId}.ll_shop_${hexId(merchantId)}`;
export const shopObjectId = (issuerId: string, merchantId: string, userId: string) => `${issuerId}.ll_s_${hexId(merchantId)}_${hexId(userId)}`;

/** The secret in the class's callback URL (only Google and we know it), so a forged "del" can't mark someone's card removed. */
export const googleCallbackKey = (config: Pick<Config, "jwtSecret">, classId: string) => hmacSha256(`wallet-google-callback:${config.jwtSecret}`, classId).slice(0, 32);

const lsv = (lang: string, value: string) => ({ defaultValue: { language: lang, value } });

/** One loyalty class per shop: its name, logo, colour, links and storefront pins. */
export function shopLoyaltyClass(config: Pick<Config, "publicApiUrl" | "publicWebUrl" | "jwtSecret">, issuerId: string, m: ShopPassModel, locs: PassLocation[]) {
  const id = shopClassId(issuerId, m.merchantId);
  const lang = LOCALES[m.locale].bcp47;
  const logo = m.logoUrl && /^https:\/\//i.test(m.logoUrl) ? m.logoUrl : `${config.publicApiUrl}/v1/wallet/assets/logo.png`;
  return {
    id,
    issuerName: truncate(m.name, 40),
    programName: cap(translate(m.locale, "sh.wcard.description", { shop: "" }).trim()) || "Loyalty card",
    localizedIssuerName: lsv(lang, truncate(m.name, 40)),
    programLogo: { sourceUri: { uri: logo }, contentDescription: lsv(lang, m.name) },
    hexBackgroundColor: m.colors.background,
    countryCode: "CA",
    reviewStatus: "UNDER_REVIEW",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
    homepageUri: { uri: m.shopUrl, description: m.name },
    callbackOptions: { url: `${config.publicApiUrl}/v1/wallet/google/callback?k=${googleCallbackKey(config, id)}` },
    // Storefronts only (privacy rule). merchantLocations replaces the deprecated `locations`.
    ...(locs.length ? { merchantLocations: locs.slice(0, 10).map((l) => ({ latitude: l.latitude, longitude: l.longitude })) } : {}),
  };
}

/** One loyalty object per membership. */
export function shopLoyaltyObject(config: Pick<Config, "publicApiUrl">, issuerId: string, userId: string, m: ShopPassModel) {
  const tr = trFor(m.locale);
  const unit = cap(unitWord(m.locale, m.terminology));
  const appt = m.nextAppointment;
  const when = appt ? new Intl.DateTimeFormat(LOCALES[m.locale].bcp47, { dateStyle: "medium", timeStyle: "short", timeZone: m.timezone }).format(new Date(appt.startsAt)) : null;
  const modules = [
    { id: "reward", header: tr("sh.wcard.nextReward"), body: rewardLine(m) },
    ...(appt ? [{ id: "visit", header: tr("sh.wcard.nextVisit"), body: appt.label ? `${when}\n${appt.label}` : when! }] : []),
    ...(m.hours ? [{ id: "hours", header: tr("sh.wcard.hours"), body: m.hours }] : []),
    ...(m.place ? [{ id: "where", header: tr("sh.wcard.where"), body: m.place }] : []),
    { id: "how", header: tr("sh.pass.howLabel"), body: tr("sh.wcard.how", { shop: m.name, unit: unitWord(m.locale, m.terminology) }) },
    ...(m.terms ? [{ id: "terms", header: tr("sh.pass.terms"), body: m.terms.slice(0, 500) }] : []),
  ];
  return {
    id: shopObjectId(issuerId, m.merchantId, userId),
    classId: shopClassId(issuerId, m.merchantId),
    state: "ACTIVE",
    accountId: m.memberCode,
    accountName: truncate(m.memberName ?? m.memberCode, 20),
    loyaltyPoints: { label: truncate(unit, 9), balance: { string: truncate(balanceLine(m), 12) } },
    ...(m.rewardsReady > 0 ? { secondaryLoyaltyPoints: { label: truncate(cap(tr("sh.pass.ready")), 9), balance: { int: m.rewardsReady } } } : {}),
    barcode: { type: "QR_CODE", value: m.qrValue, alternateText: m.memberCode },
    ...(m.strip === "stamps" ? { heroImage: { sourceUri: { uri: `${config.publicApiUrl}/v1/wallet/strip.png?${stripQuery(stripInputOf(m))}` }, contentDescription: lsv(LOCALES[m.locale].bcp47, `${unit}: ${balanceLine(m)}`) } } : {}),
    textModulesData: modules.slice(0, 10),
    linksModuleData: {
      uris: [
        ...(m.bookingUrl ? [{ id: "book", uri: m.bookingUrl, description: tr("sh.wcard.book") }] : []),
        { id: "shop", uri: m.shopUrl, description: tr("sh.wcard.shopPage", { shop: m.name }) },
        { id: "support", uri: `mailto:${BRAND.supportEmail}`, description: tr("sh.pass.support") },
      ],
    },
  };
}

export async function googleShopSaveUrl(ctx: AppContext, userId: string, merchantId: string): Promise<string> {
  const creds = googleCreds(ctx.config);
  if (!creds) throw new HttpError(503, "wallet_not_configured", "Google Wallet cards aren't available on this server yet.");
  await getOrCreateShopPass(ctx, userId, merchantId, "google");
  const { model, locations: locs } = await shopPassModel(ctx, userId, merchantId);
  const { SignJWT, importPKCS8 } = await import("jose");
  const key = await importPKCS8(creds.sa.private_key, "RS256");
  const jwt = await new SignJWT({
    origins: [ctx.config.publicWebUrl],
    typ: "savetowallet",
    // The class rides along so the first save creates it; later saves only add the object.
    payload: { loyaltyClasses: [shopLoyaltyClass(ctx.config, creds.issuerId, model, locs)], loyaltyObjects: [shopLoyaltyObject(ctx.config, creds.issuerId, userId, model)] },
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(creds.sa.client_email)
    .setAudience("google")
    .setIssuedAt(Math.floor(ctx.now().getTime() / 1000))
    .sign(key);
  // Dev-fake mode: a local page that shows what Google would get (pay.google.com would reject the fake signature).
  if (creds.fake) return `${ctx.config.publicApiUrl}/v1/wallet/dev/google-save?jwt=${jwt}`;
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

async function googleSend(ctx: AppContext, method: "PATCH" | "POST", path: string, json: unknown): Promise<"ok" | "missing"> {
  const f = googleHttp(ctx.config, httpFor(ctx));
  const token = await accessToken(ctx.config, f, ctx.now());
  try {
    await requestJson(f, `${WALLET_API}/${path}`, { method, headers: { authorization: `Bearer ${token}` }, json });
    return "ok";
  } catch (err) {
    if ((err as { status?: number }).status === 404) return "missing";
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Status for the buttons
// ---------------------------------------------------------------------------
const LINK_TTL_MS = 10 * 60 * 1000;
const linkKey = (ctx: AppContext) => `wallet-shop-link:${ctx.config.jwtSecret}`;

export function signShopDownloadToken(ctx: AppContext, userId: string, merchantId: string): string {
  const exp = ctx.now().getTime() + LINK_TTL_MS;
  const body = `${userId}.${merchantId}.${exp}`;
  return `${body}.${hmacSha256(linkKey(ctx), body)}`;
}

export function verifyShopDownloadToken(ctx: AppContext, token: string): { userId: string; merchantId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, merchantId, exp, sig] = parts as [string, string, string, string];
  if (!safeEqual(hmacSha256(linkKey(ctx), `${userId}.${merchantId}.${exp}`), sig)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) < ctx.now().getTime()) return null;
  return { userId, merchantId };
}

const googleConfigured = (config: Config) => !!googleCreds(config);
export const walletAvailability = (config: Config): walletApi.WalletAvailability => ({ apple: !!appleSignerFromConfig(config), google: googleConfigured(config) });

/** In a wallet now: confirmed added, and not removed since. */
export const inWallet = (p: Pick<ShopPass, "addedAt" | "removedAt"> | undefined) => !!p?.addedAt && (!p.removedAt || p.removedAt < p.addedAt);
/** Removed on purpose (a later removal than the last add): stop pushing to it. */
export const removedOnPurpose = (p: Pick<ShopPass, "addedAt" | "removedAt">) => !!p.removedAt && (!p.addedAt || p.removedAt >= p.addedAt);

export async function shopWalletStatus(ctx: AppContext, userId: string, merchantId: string): Promise<walletApi.ShopWalletResponse> {
  // 404 unless a member (the same check the pass builders make).
  await shopPassModel(ctx, userId, merchantId);
  const avail = walletAvailability(ctx.config);
  const passes = await ctx.db.select().from(walletPasses).where(and(eq(walletPasses.userId, userId), eq(walletPasses.merchantId, merchantId)));
  return {
    merchantId,
    apple: { available: avail.apple, url: avail.apple ? `${ctx.config.publicApiUrl}/v1/wallet/apple/shop-download?token=${encodeURIComponent(signShopDownloadToken(ctx, userId, merchantId))}` : null, added: inWallet(passes.find((p) => p.platform === "apple")) },
    google: { available: avail.google, url: avail.google ? await googleShopSaveUrl(ctx, userId, merchantId) : null, added: inWallet(passes.find((p) => p.platform === "google")) },
  };
}

// ---------------------------------------------------------------------------
// Removal
// ---------------------------------------------------------------------------
/** Apple: after an unregister, a pass with no device left is removed (no more pushes until it is added again). */
export async function markAppleRemovedIfUnregistered(ctx: AppContext, passId: string): Promise<boolean> {
  const left = await ctx.db.select({ id: walletDeviceRegistrations.id }).from(walletDeviceRegistrations).where(eq(walletDeviceRegistrations.passId, passId)).limit(1);
  if (left.length) return false;
  await ctx.db.update(walletPasses).set({ removedAt: ctx.now() }).where(eq(walletPasses.id, passId));
  return true;
}

export async function markAppleAdded(ctx: AppContext, passId: string) {
  await ctx.db.update(walletPasses).set({ addedAt: ctx.now() }).where(eq(walletPasses.id, passId));
}

/**
 * Google callback (class callbackOptions): `{ signedMessage: "{classId, objectId, eventType: save|del, ...}" }`. The URL key
 * authenticates the caller. Returns what changed, for tests.
 */
export async function markGoogleEvent(ctx: AppContext, key: string, body: unknown): Promise<"saved" | "removed" | "ignored"> {
  let msg: { classId?: string; objectId?: string; eventType?: string } = {};
  try {
    const raw = (body as { signedMessage?: unknown })?.signedMessage;
    msg = typeof raw === "string" ? JSON.parse(raw) : ((raw as typeof msg) ?? {});
  } catch {
    return "ignored";
  }
  const creds = googleCreds(ctx.config);
  if (!creds || !msg.classId || !msg.objectId || !safeEqual(googleCallbackKey(ctx.config, msg.classId), key)) throw new HttpError(401, "unauthorized", "Bad callback key");
  const m = new RegExp(`^${creds.issuerId.replace(/\./g, "\\.")}\\.ll_s_([0-9a-f]{32})_([0-9a-f]{32})$`).exec(msg.objectId);
  if (!m || msg.classId !== `${creds.issuerId}.ll_shop_${m[1]}`) return "ignored";
  const uuid = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  const [pass] = await ctx.db
    .select()
    .from(walletPasses)
    .where(and(eq(walletPasses.merchantId, uuid(m[1]!)), eq(walletPasses.userId, uuid(m[2]!)), eq(walletPasses.platform, "google")))
    .limit(1);
  if (!pass) return "ignored";
  if (msg.eventType === "del") {
    await ctx.db.update(walletPasses).set({ removedAt: ctx.now() }).where(eq(walletPasses.id, pass.id));
    return "removed";
  }
  if (msg.eventType === "save") {
    await ctx.db.update(walletPasses).set({ addedAt: ctx.now() }).where(eq(walletPasses.id, pass.id));
    return "saved";
  }
  return "ignored";
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------
const lastShopContent = new WeakMap<AppContext, Map<string, string>>();

export interface ShopPassUpdateResult {
  changed: boolean;
  apple: { devices: number; sent: number; invalid: number };
  google: "updated" | "missing" | "skipped" | "removed" | "failed";
}

/**
 * Rebuild one customer's card at one shop and push it: Apple (bump last_updated_at, APNs to every registered device, which
 * then fetches the latest pass) and Google (PATCH the object). Skipped when nothing on the card changed. Never throws.
 */
export async function notifyShopPassUpdate(ctx: AppContext, userId: string, merchantId: string, opts: { force?: boolean; notify?: boolean } = {}): Promise<ShopPassUpdateResult | undefined> {
  try {
    const passes = await ctx.db.select().from(walletPasses).where(and(eq(walletPasses.userId, userId), eq(walletPasses.merchantId, merchantId)));
    if (!passes.length) return undefined;
    let built: Awaited<ReturnType<typeof shopPassModel>>;
    try {
      built = await shopPassModel(ctx, userId, merchantId);
    } catch {
      return undefined; // left the shop, or the shop closed
    }
    const hash = createHash("sha1").update(JSON.stringify(built)).digest("hex");
    let seen = lastShopContent.get(ctx);
    if (!seen) lastShopContent.set(ctx, (seen = new Map()));
    const key = `${userId}:${merchantId}`;
    const out: ShopPassUpdateResult = { changed: false, apple: { devices: 0, sent: 0, invalid: 0 }, google: "skipped" };
    if (!opts.force && seen.get(key) === hash) return out;
    seen.set(key, hash);
    out.changed = true;
    // Strictly later than the last tag, so a device that just fetched still sees this as new.
    const at = new Date(Math.max(ctx.now().getTime(), ...passes.map((p) => p.lastUpdatedAt.getTime() + 1000)));
    await ctx.db.update(walletPasses).set({ lastUpdatedAt: at }).where(and(eq(walletPasses.userId, userId), eq(walletPasses.merchantId, merchantId)));
    const apple = passes.find((p) => p.platform === "apple");
    if (apple) {
      const regs = await ctx.db.select().from(walletDeviceRegistrations).where(eq(walletDeviceRegistrations.passId, apple.id));
      out.apple.devices = regs.length;
      const topic = passTypeIdOf(ctx.config);
      if (regs.length && topic) {
        const r = await apnsFor(ctx).push([...new Set(regs.map((x) => x.pushToken))], topic);
        out.apple.sent = r.sent;
        out.apple.invalid = r.invalid.length;
        if (r.invalid.length) await ctx.db.delete(walletDeviceRegistrations).where(and(eq(walletDeviceRegistrations.passId, apple.id), inArray(walletDeviceRegistrations.pushToken, r.invalid)));
      }
    }
    const google = passes.find((p) => p.platform === "google");
    const creds = googleCreds(ctx.config);
    if (google && creds) {
      if (removedOnPurpose(google)) out.google = "removed";
      else {
        try {
          const obj = shopLoyaltyObject(ctx.config, creds.issuerId, userId, built.model);
          const r = await googleSend(ctx, "PATCH", `loyaltyObject/${encodeURIComponent(obj.id)}`, { ...obj, notifyPreference: opts.notify === false ? "DO_NOT_NOTIFY" : "NOTIFY" });
          out.google = r === "ok" ? "updated" : "missing";
        } catch (err) {
          out.google = "failed";
          if (ctx.config.env !== "test") console.error(`[wallet] Google shop card update failed for ${userId}@${merchantId}`, err);
        }
      }
    }
    return out;
  } catch (err) {
    if (ctx.config.env !== "test") console.error(`[wallet] shop card update failed for ${userId}@${merchantId}`, err);
    return undefined;
  }
}

/**
 * The shop changed its card (Settings, Wallet card, or its name/logo/colour): PATCH the Google class once, then rebuild every
 * card of that shop (Apple push + Google object PATCH, without a notification). Bounded; never throws.
 */
export async function refreshShopCards(ctx: AppContext, merchantId: string, max = 5000): Promise<{ cards: number; google: "updated" | "missing" | "skipped" | "failed" }> {
  let google: "updated" | "missing" | "skipped" | "failed" = "skipped";
  try {
    const creds = googleCreds(ctx.config);
    if (creds) {
      const [anyGoogle] = await ctx.db.select({ id: walletPasses.id }).from(walletPasses).where(and(eq(walletPasses.merchantId, merchantId), eq(walletPasses.platform, "google"))).limit(1);
      if (anyGoogle) {
        try {
          const sample = await sampleShopModel(ctx, merchantId);
          const shop = await loadShop(ctx, merchantId);
          const cls = shopLoyaltyClass(ctx.config, creds.issuerId, sample, shopPassLocations(shop.merchant, shop.locs, "en"));
          google = (await googleSend(ctx, "PATCH", `loyaltyClass/${encodeURIComponent(cls.id)}`, cls)) === "ok" ? "updated" : "missing";
        } catch (err) {
          google = "failed";
          if (ctx.config.env !== "test") console.error(`[wallet] Google class update failed for ${merchantId}`, err);
        }
      }
    }
    const users = await ctx.db.selectDistinct({ userId: walletPasses.userId }).from(walletPasses).where(eq(walletPasses.merchantId, merchantId)).limit(max);
    for (const u of users) await notifyShopPassUpdate(ctx, u.userId, merchantId, { force: true, notify: false });
    return { cards: users.length, google };
  } catch (err) {
    if (ctx.config.env !== "test") console.error(`[wallet] refreshing cards failed for ${merchantId}`, err);
    return { cards: 0, google };
  }
}

/** Cards in wallets right now, for Settings (Apple: a registered device; Google: not removed). */
export async function cardsInWallets(ctx: AppContext, merchantId: string): Promise<{ apple: number; google: number }> {
  const rows = await ctx.db.select({ platform: walletPasses.platform, addedAt: walletPasses.addedAt, removedAt: walletPasses.removedAt }).from(walletPasses).where(and(eq(walletPasses.merchantId, merchantId), isNotNull(walletPasses.addedAt)));
  return { apple: rows.filter((r) => r.platform === "apple" && inWallet(r)).length, google: rows.filter((r) => r.platform === "google" && inWallet(r)).length };
}

/** Public artwork for the Google class when the shop has no https logo. */
export const fallbackLogo = () => walletAsset("google-logo.png");

// Every ledger balance change updates that shop's card.
registerBalanceListener("wallet_shop_pass", async (ctx, change) => {
  await notifyShopPassUpdate(ctx, change.userId, change.merchantId);
});

// ---------------------------------------------------------------------------
// Triggers from other services (fire-and-forget, tracked so tests can wait)
// ---------------------------------------------------------------------------
const pendingWork = new Set<Promise<unknown>>();
const track = (p: Promise<unknown>) => {
  pendingWork.add(p);
  void p.finally(() => pendingWork.delete(p));
};
/** Wait for every queued card update (tests, graceful shutdown). */
export async function flushWalletWork(): Promise<void> {
  while (pendingWork.size) await Promise.allSettled([...pendingWork]);
}

/** An appointment was booked, confirmed, moved, cancelled or finished: refresh that customer's card at that shop. */
export function walletAppointmentChanged(ctx: AppContext, a: { merchantId: string; userId: string | null }): void {
  if (a.userId) track(notifyShopPassUpdate(ctx, a.userId, a.merchantId));
}

const refreshing = new WeakMap<AppContext, Map<string, { again: boolean }>>();
/** The shop changed something every card shows (wallet card settings, name, logo, colour, program, rewards, hours). Coalesced per shop. */
export function walletShopChanged(ctx: AppContext, merchantId: string): void {
  let m = refreshing.get(ctx);
  if (!m) refreshing.set(ctx, (m = new Map()));
  const running = m.get(merchantId);
  if (running) {
    running.again = true;
    return;
  }
  const state = { again: false };
  m.set(merchantId, state);
  track(
    (async () => {
      try {
        do {
          state.again = false;
          await refreshShopCards(ctx, merchantId);
        } while (state.again);
      } finally {
        m.delete(merchantId);
      }
    })(),
  );
}
