import { createHash } from "node:crypto";
import { isPlaceholderEmail, missingBrandConfig } from "@ll/shared";
/** Runtime configuration. Every value has a safe local-dev default. */
export interface Config {
  env: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  /** 32-byte hex key for encrypting connector credentials at rest. */
  encryptionKey: string;
  publicApiUrl: string;
  publicWebUrl: string;
  corsOrigins: string[];
  /**
   * How many proxy hops to trust for the client address (X-Forwarded-For). `true` trusts every hop, which lets a
   * caller pick its own address and walk around per-address limits, so production defaults to one hop (the load balancer).
   */
  trustProxy: boolean | number;
  /**
   * After-commit outbox (services/outbox.ts). `inline` delivers before the request returns (the default in tests, so
   * assertions are deterministic; OUTBOX_INLINE=1 forces it anywhere, 0 turns it off). Otherwise delivery starts on
   * the next tick in the background and the `outbox.drain` job retries anything that failed. OUTBOX_FAST_PATH=0 turns
   * the next-tick delivery off, leaving it all to the drain job (a few seconds later); load tests use it to
   * measure the request on its own.
   */
  outbox: { inline: boolean; fastPath: boolean };
  /**
   * Where the per-key rate-limit counters (lib/rate-limit.ts and the blanket @fastify/rate-limit cap) live.
   * `memory` (default): per API process, so with N instances the effective limit is N times higher.
   * `postgres`: one shared table (rate_limit_counters), for deployments with more than one instance.
   */
  rateLimit: { store: "memory" | "postgres" };
  /**
   * Where uploads live (providers/storage.ts). STORAGE_PROVIDER=r2|disk|memory; default `memory` in tests, `disk` otherwise.
   * `r2` is Cloudflare R2 over its S3 API and needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET
   * (R2_ENDPOINT and R2_PUBLIC_BASE are optional). Disk keeps files under UPLOADS_DIR.
   */
  storage: {
    provider: "r2" | "disk" | "memory";
    r2?: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; endpoint?: string; publicBase?: string };
  };
  /**
   * Address to map pin at signup (providers/geocoder.ts). GEOCODER_PROVIDER=nominatim|none; default nominatim in production
   * (OpenStreetMap, one lookup per signup), none elsewhere so dev and tests never call out. GEOCODER_URL overrides the endpoint.
   */
  geocoder: { provider: "nominatim" | "none"; url: string; userAgent: string };
  /** Merchants need this many active members to count as "activated". */
  activationThreshold: number;
  sms: { provider: "console" | "twilio"; twilioAccountSid?: string; twilioAuthToken?: string; twilioFrom?: string; twilioMessagingServiceSid?: string };
  email: { provider: "console" | "resend"; resendApiKey?: string; from: string };
  push: { provider: "console" | "expo"; expoAccessToken?: string };
  /** WhatsApp Cloud API (Meta Graph). Without an access token the fake provider is used. */
  whatsapp: { provider: "fake" | "meta"; accessToken?: string; appSecret?: string; verifyToken?: string; apiVersion: string };
  /**
   * Our own sales and support assistant (services/sales-agent). Needs ANTHROPIC_API_KEY to answer; without it the chat
   * still opens (disclosure, STOP/START, hand-off to a person) and every message goes to the admin queue.
   * SALES_AGENT_WHATSAPP_NUMBER is the platform number prospects message (display number, digits ok);
   * SALES_AGENT_WHATSAPP_PHONE_NUMBER_ID its Meta phone number id (inbound webhooks and sends use it).
   * SALES_AGENT_ENABLED=0 hides the widget and ignores the platform number. SALES_AGENT_MODEL / _EFFORT tune the model.
   */
  salesAgent: { enabled: boolean; apiKey?: string; model: string; effort: "low" | "medium" | "high"; fallbacks: boolean; whatsappNumber?: string; whatsappPhoneNumberId?: string; adminEmail?: string };
  // ---- phase-solo: G ----
  /**
   * Website builder (services/site*.ts). AI copy needs ANTHROPIC_API_KEY; without it the builder runs on presets and template
   * copy. SITE_AI_MODEL (drafts, default claude-opus-5-5), SITE_AI_EDIT_MODEL (one-line rewrites, default claude-haiku-5-5),
   * SITE_AI_EFFORT (low | medium | high, default low), SITE_AI_FALLBACKS=0 turns off server-side refusal fallbacks.
   * SITE_DOMAINS_ENABLED=1 turns on .ca registration and custom-hostname routing through Cloudflare (CLOUDFLARE_API_TOKEN,
   * CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID, SITE_CNAME_TARGET); off, domains are requested by hand and set up by an admin.
   */
  site: {
    apiKey?: string;
    /** SITE_AI_FAKE=1 (never in production): a deterministic local stand-in for the model, for e2e runs without a key. */
    fake: boolean;
    model: string;
    editModel: string;
    effort: "low" | "medium" | "high";
    fallbacks: boolean;
    domainsEnabled: boolean;
    cloudflare: { apiToken?: string; accountId?: string; zoneId?: string };
    cnameTarget: string;
    domainPriceCents: number;
  };
  // ---- end phase-solo: G ----
  /** Phone ordering webhook (Twilio-style). The signature is checked with `authToken` (falls back to TWILIO_AUTH_TOKEN). */
  phone: { authToken?: string };
  /** TIFFIN_PAD=1 lets tiffin subscribers pay by pre-authorized debit (Stripe acss_debit). */
  tiffin?: { padEnabled?: boolean };
  stripe: { secretKey?: string; webhookSecret?: string; prices: { plusMonthly?: string; plusAnnual?: string; studioMonthly?: string; studioAnnual?: string; proMonthly?: string; proAnnual?: string };
    /** STRIPE_DIRECT_CHARGES: honour merchants.chargeMode = "direct" (merchant of record). Default on (phase solo); set 0 to force destination. */
    directCharges?: boolean;
    /** STRIPE_AUTOMATIC_TAX: Stripe Tax collects GST/HST on our own subscription checkouts (needs Stripe Tax registrations). Default off. */
    automaticTax?: boolean;
  };
  square: { appId?: string; appSecret?: string; webhookSignatureKey?: string; environment: "sandbox" | "production" };
  clover: { appId?: string; appSecret?: string; environment: "sandbox" | "production"; webhookAuthCode?: string };
  shopify: { apiKey?: string; apiSecret?: string };
  lightspeed: { clientId?: string; clientSecret?: string };
  toast: { clientId?: string; clientSecret?: string; webhookSecret?: string; apiHost: string };
  mailchimp: { clientId?: string; clientSecret?: string };
  google: { walletIssuerId?: string; walletServiceAccountJson?: string; placesApiKey?: string };
  apple: {
    passTypeId?: string;
    teamId?: string;
    certPem?: string;
    keyPem?: string;
    wwdrPem?: string;
    keyPassphrase?: string;
    /** The Pass Type ID certificate + key as one .p12 (base64), instead of certPem/keyPem. */
    p12Base64?: string;
    p12Password?: string;
    /**
     * APNs token auth (.p8 key from Apple Developer → Keys). Optional: Apple's PassKit docs say pass-update pushes use the
     * pass certificate, so the certificate goes first and the token is only used when no certificate is set.
     */
    apnsKeyId?: string;
    apnsKeyP8?: string;
  };
  /**
   * WALLET_DEV_FAKE=1 (never honoured in production): a throwaway Apple signer and Google service account, and Google REST
   * calls recorded instead of sent, so the wallet buttons and passes work end to end in dev and e2e without real credentials.
   */
  walletDevFake: boolean;
  /**
   * Landing A/B tests (services/landing-events.ts, admin-experiments.ts). Test clock: outside production, EXPERIMENTS_NOW (an ISO
   * instant) pins the experiment schedule and the x-ll-experiments-now header moves it per request (e2e/run-all.sh). Lighthouse:
   * EXPERIMENTS_LIGHTHOUSE_JSON is the path of the JSON the e2e run writes ({ "<experimentId>:<variant>" | "<variant>": score }).
   */
  experiments: { testClock: boolean; now?: string; lighthouseJson?: string };
  // ---- wave-n: promo ----
  /**
   * The AI campaign helper and the shared Claude key (services/ai-key.ts, promo-ai.ts). The founder pastes a key at /admin/ai; it is
   * stored AES-256-GCM encrypted with APP_ENCRYPTION_KEY (64 hex characters, or a passphrase of 32+ characters that is hashed);
   * without that master key the admin page refuses to save. ANTHROPIC_API_KEY stays the fallback for every AI feature.
   * PROMO_AI_MODEL (default claude-opus-5-5) and PROMO_AI_MODELS (the list the admin can pick from) keep model ids in config.
   * PROMO_AI_PLANS (default "plus,studio,pro,trial") are the plans the helper is open to; Free gets the admin's small taste.
   * PROMO_AI_FAKE=1 (never in production): a deterministic stand-in, for tests and e2e without a key.
   */
  ai: { masterKeyHex?: string; envKey?: string; model: string; models: string[]; validateModel: string; plans: string[]; fake: boolean; effort: "low" | "medium" | "high"; prices: Record<string, { inputPerM: number; outputPerM: number }> };
  // ---- end wave-n: promo ----
  // ---- wave-o: import ----
  /**
   * "Have a website or Instagram?" (services/site-import). SITE_IMPORT_AI_MODEL (default claude-haiku-5-5) is the small model that
   * tidies the name and description and maps services when the shared Claude key is set (services/ai-key.ts); it runs on the same
   * quotas and meter as the promo writer. SITE_IMPORT_AI=0 turns the tidy-up off. SITE_IMPORT_TEST_HOSTS (never in production) is a
   * comma-separated list of `host=ip` pairs the e2e stack uses to reach its local fixture site: those hosts resolve to that address
   * without the private-address check. Every other host goes through the SSRF guard.
   */
  siteImport: { aiModel: string; ai: boolean; testHosts: Record<string, string>; userAgent: string };
  // ---- end wave-o: import ----
}

/** APP_ENCRYPTION_KEY → a 32-byte hex key: 64 hex characters as they are, a long passphrase hashed. Short values are ignored (no key). */
export function masterKeyFrom(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return v.toLowerCase();
  if (v.length >= 32) return createHash("sha256").update(v).digest("hex");
  return undefined;
}

function parseTrustProxy(v: string | undefined, isProd: boolean): boolean | number {
  if (v === undefined || v === "") return isProd ? 1 : true;
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : isProd ? 1 : true;
}

const DEV_JWT_SECRET = "dev-only-jwt-secret-change-me-dev-only-jwt-secret";
const DEV_ENCRYPTION_KEY = "0".repeat(64);
const DEV_EMAIL_FROM = "Local Loyalty <hello@localloyalty.example>";

/** An address that only exists on this machine, or a reserved/test host: never right for a launch. */
function badPublicUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return "is not set";
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return `is not a web address (${raw})`;
  }
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h === "0.0.0.0" || h.endsWith(".localhost")) return `points at this machine (${raw})`;
  if (/(^|\.)(example|invalid|test)$/.test(h) || /(^|\.)example\.(com|org|net)$/.test(h)) return `is a placeholder host (${raw})`;
  if (u.protocol !== "https:") return `must be https (${raw})`;
  return null;
}

/**
 * Everything a production server needs before it takes a customer. Returns EVERY problem (not just the first) so one failed deploy
 * names all of them. Escape hatches for a staging server that runs with NODE_ENV=production: ALLOW_CONSOLE_SMS=1, ALLOW_CONSOLE_EMAIL=1,
 * ALLOW_FAKE_PAYMENTS=1, WHATSAPP_DISABLED=1. None of them is for a public launch.
 */
export function productionConfigProblems(env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  const jwt = env.JWT_SECRET ?? "";
  if (!jwt) out.push("JWT_SECRET is not set (32+ random characters: openssl rand -base64 48)");
  else if (jwt.length < 32 || jwt === DEV_JWT_SECRET) out.push("JWT_SECRET is too short or the development value (use 32+ random characters)");
  const enc = env.ENCRYPTION_KEY ?? "";
  if (!enc) out.push("ENCRYPTION_KEY is not set (64 hex characters: openssl rand -hex 32)");
  else if (!/^[0-9a-f]{64}$/i.test(enc) || /^0+$/.test(enc)) out.push("ENCRYPTION_KEY must be 64 hex characters and not all zeros (openssl rand -hex 32)");
  for (const name of ["PUBLIC_API_URL", "PUBLIC_WEB_URL"]) {
    const bad = badPublicUrl(env[name]);
    if (bad) out.push(`${name} ${bad}`);
  }
  if (!env.CORS_ORIGINS?.trim()) out.push("CORS_ORIGINS is not set (the web app's https origin)");
  else
    for (const o of env.CORS_ORIGINS.split(",").map((x) => x.trim()).filter(Boolean)) {
      const bad = badPublicUrl(o);
      if (bad) out.push(`CORS_ORIGINS entry ${bad}`);
    }
  if (env.ALLOW_FAKE_PAYMENTS !== "1") {
    if (!env.STRIPE_SECRET_KEY) out.push("STRIPE_SECRET_KEY is not set (payments would run on the fake provider)");
    else if (!/^(sk|rk)_/.test(env.STRIPE_SECRET_KEY)) out.push("STRIPE_SECRET_KEY does not look like a Stripe secret key (sk_... or rk_...)");
    if (!env.STRIPE_WEBHOOK_SECRET) out.push("STRIPE_WEBHOOK_SECRET is not set (webhooks cannot be verified)");
    else if (!/^whsec_/.test(env.STRIPE_WEBHOOK_SECRET) || /fake/i.test(env.STRIPE_WEBHOOK_SECRET)) out.push("STRIPE_WEBHOOK_SECRET does not look like a Stripe signing secret (whsec_...)");
  }
  if (env.ALLOW_CONSOLE_EMAIL !== "1") {
    if (!env.RESEND_API_KEY) out.push("RESEND_API_KEY is not set (email would only be printed to the log)");
    if (!env.EMAIL_FROM?.trim()) out.push("EMAIL_FROM is not set (e.g. Local Loyalty <hello@your-domain>)");
    else if (isPlaceholderEmail(env.EMAIL_FROM)) out.push(`EMAIL_FROM is a placeholder (${env.EMAIL_FROM})`);
  }
  if (env.WHATSAPP_DISABLED !== "1") {
    if (!env.WHATSAPP_ACCESS_TOKEN) out.push("WHATSAPP_ACCESS_TOKEN is not set (set WHATSAPP_DISABLED=1 to launch without WhatsApp)");
    else if (!env.WHATSAPP_APP_SECRET) out.push("WHATSAPP_APP_SECRET is not set (WhatsApp webhooks cannot be verified)");
  }
  if (!masterKeyFrom(env.APP_ENCRYPTION_KEY)) out.push("APP_ENCRYPTION_KEY is not set or too short (64 hex characters or a 32+ character passphrase)");
  out.push(...missingBrandConfig(env));
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Unset means a developer's machine. Anything else must be one of the three names: "staging" or a typo would otherwise run as
  // development (open CORS, sign-in codes in responses), so it is refused rather than guessed.
  const rawEnv = env.NODE_ENV?.trim() || "development";
  if (rawEnv !== "development" && rawEnv !== "test" && rawEnv !== "production") throw new Error(`NODE_ENV must be development, test or production (got "${rawEnv}"). A staging server runs production with the ALLOW_* escape hatches.`);
  const nodeEnv: Config["env"] = rawEnv;
  const isProd = nodeEnv === "production";
  const storageProvider = env.STORAGE_PROVIDER || (nodeEnv === "test" ? "memory" : "disk");
  if (storageProvider !== "r2" && storageProvider !== "disk" && storageProvider !== "memory") throw new Error(`STORAGE_PROVIDER must be r2, disk or memory (got "${storageProvider}")`);
  if (storageProvider === "memory" && isProd) throw new Error("STORAGE_PROVIDER=memory loses every upload on restart; use r2 or disk in production");
  const r2Missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((n) => !env[n]);
  if (storageProvider === "r2" && r2Missing.length) throw new Error(`STORAGE_PROVIDER=r2 needs ${r2Missing.join(", ")}`);
  if (isProd) {
    const problems = productionConfigProblems(env);
    // Customers sign in with a texted code: without Twilio the code only reaches the server log and nobody can sign in.
    const twilioReady = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM));
    if (!twilioReady && env.ALLOW_CONSOLE_SMS !== "1")
      problems.push("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM are not all set (sign-in codes are texted; ALLOW_CONSOLE_SMS=1 only on a staging server)");
    if (problems.length) throw new Error(`Production is not launch-ready. Fix these and start again:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  }
  return {
    env: nodeEnv,
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? "pglite://./.pglite/dev",
    jwtSecret: env.JWT_SECRET ?? DEV_JWT_SECRET,
    encryptionKey: env.ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
    publicApiUrl: env.PUBLIC_API_URL ?? "http://localhost:4000",
    publicWebUrl: env.PUBLIC_WEB_URL ?? "http://localhost:3000",
    trustProxy: parseTrustProxy(env.TRUST_PROXY_HOPS, isProd),
    outbox: { inline: env.OUTBOX_INLINE ? env.OUTBOX_INLINE === "1" : nodeEnv === "test", fastPath: env.OUTBOX_FAST_PATH !== "0" },
    rateLimit: { store: env.RATE_LIMIT_STORE === "postgres" ? "postgres" : "memory" },
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:8081").split(",").map((s) => s.trim()),
    storage: {
      provider: storageProvider,
      r2:
        storageProvider === "r2"
          ? { accountId: env.R2_ACCOUNT_ID!, accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, bucket: env.R2_BUCKET!, endpoint: env.R2_ENDPOINT || undefined, publicBase: env.R2_PUBLIC_BASE || undefined }
          : undefined,
    },
    activationThreshold: Number(env.ACTIVATION_THRESHOLD ?? 25),
    sms: {
      provider: env.TWILIO_ACCOUNT_SID ? "twilio" : "console",
      twilioAccountSid: env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: env.TWILIO_AUTH_TOKEN,
      twilioFrom: env.TWILIO_FROM,
      twilioMessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    },
    email: { provider: env.RESEND_API_KEY ? "resend" : "console", resendApiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM ?? DEV_EMAIL_FROM },
    push: { provider: env.EXPO_ACCESS_TOKEN || env.EXPO_PUSH === "1" ? "expo" : "console", expoAccessToken: env.EXPO_ACCESS_TOKEN },
    whatsapp: {
      provider: env.WHATSAPP_ACCESS_TOKEN ? "meta" : "fake",
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      appSecret: env.WHATSAPP_APP_SECRET,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      apiVersion: env.WHATSAPP_API_VERSION ?? "v21.0",
    },
    salesAgent: {
      enabled: env.SALES_AGENT_ENABLED !== "0",
      apiKey: env.ANTHROPIC_API_KEY || undefined,
      model: env.SALES_AGENT_MODEL || "claude-opus-5-5",
      effort: env.SALES_AGENT_EFFORT === "medium" || env.SALES_AGENT_EFFORT === "high" ? env.SALES_AGENT_EFFORT : "low",
      fallbacks: env.SALES_AGENT_FALLBACKS !== "0",
      whatsappNumber: env.SALES_AGENT_WHATSAPP_NUMBER?.replace(/\D/g, "") || undefined,
      whatsappPhoneNumberId: env.SALES_AGENT_WHATSAPP_PHONE_NUMBER_ID || undefined,
      adminEmail: env.SALES_AGENT_ADMIN_EMAIL || undefined,
    },
    // ---- phase-solo: G ----
    site: {
      apiKey: env.ANTHROPIC_API_KEY || undefined,
      fake: env.SITE_AI_FAKE === "1" && !isProd,
      model: env.SITE_AI_MODEL || "claude-opus-5-5",
      editModel: env.SITE_AI_EDIT_MODEL || "claude-haiku-5-5",
      effort: env.SITE_AI_EFFORT === "medium" || env.SITE_AI_EFFORT === "high" ? env.SITE_AI_EFFORT : "low",
      fallbacks: env.SITE_AI_FALLBACKS !== "0",
      domainsEnabled: env.SITE_DOMAINS_ENABLED === "1" || env.SITE_DOMAINS_ENABLED === "true",
      cloudflare: { apiToken: env.CLOUDFLARE_API_TOKEN || undefined, accountId: env.CLOUDFLARE_ACCOUNT_ID || undefined, zoneId: env.CLOUDFLARE_ZONE_ID || undefined },
      cnameTarget: env.SITE_CNAME_TARGET || "sites.localloyalty.ca",
      domainPriceCents: Number(env.SITE_DOMAIN_PRICE_CENTS) > 0 ? Number(env.SITE_DOMAIN_PRICE_CENTS) : 1500,
    },
    // ---- end phase-solo: G ----
    phone: { authToken: env.PHONE_WEBHOOK_AUTH_TOKEN ?? env.TWILIO_AUTH_TOKEN },
    tiffin: { padEnabled: env.TIFFIN_PAD === "1" },
    geocoder: {
      provider: env.GEOCODER_PROVIDER === "nominatim" || (isProd && env.GEOCODER_PROVIDER !== "none") ? "nominatim" : "none",
      url: env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search",
      userAgent: env.GEOCODER_USER_AGENT ?? "LoyaltyLocal/1.0 (signup address lookup)",
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      prices: {
        plusMonthly: env.STRIPE_PRICE_PLUS_MONTHLY,
        plusAnnual: env.STRIPE_PRICE_PLUS_ANNUAL,
        // phase-pro P1: Studio ($59 / $590). Without them checkout uses an inline CAD price from PLANS.studio.
        studioMonthly: env.STRIPE_PRICE_STUDIO_MONTHLY,
        studioAnnual: env.STRIPE_PRICE_STUDIO_ANNUAL,
        proMonthly: env.STRIPE_PRICE_PRO_MONTHLY,
        proAnnual: env.STRIPE_PRICE_PRO_ANNUAL,
      },
      // phase-solo A: on unless STRIPE_DIRECT_CHARGES=0/false (new shops default to direct; destination stays for existing ones).
      directCharges: !/^(0|false|off|no)$/i.test(env.STRIPE_DIRECT_CHARGES?.trim() ?? ""),
      automaticTax: env.STRIPE_AUTOMATIC_TAX === "1" || env.STRIPE_AUTOMATIC_TAX === "true",
    },
    square: { appId: env.SQUARE_APP_ID, appSecret: env.SQUARE_APP_SECRET, webhookSignatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY, environment: env.SQUARE_ENV === "production" ? "production" : "sandbox" },
    clover: { appId: env.CLOVER_APP_ID, appSecret: env.CLOVER_APP_SECRET, environment: env.CLOVER_ENV === "production" ? "production" : "sandbox", webhookAuthCode: env.CLOVER_WEBHOOK_AUTH_CODE },
    shopify: { apiKey: env.SHOPIFY_API_KEY, apiSecret: env.SHOPIFY_API_SECRET },
    lightspeed: { clientId: env.LIGHTSPEED_CLIENT_ID, clientSecret: env.LIGHTSPEED_CLIENT_SECRET },
    toast: { clientId: env.TOAST_CLIENT_ID, clientSecret: env.TOAST_CLIENT_SECRET, webhookSecret: env.TOAST_WEBHOOK_SECRET, apiHost: env.TOAST_API_HOST ?? "https://ws-sandbox-api.eng.toasttab.com" },
    mailchimp: { clientId: env.MAILCHIMP_CLIENT_ID, clientSecret: env.MAILCHIMP_CLIENT_SECRET },
    google: { walletIssuerId: env.GOOGLE_WALLET_ISSUER_ID, walletServiceAccountJson: env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON, placesApiKey: env.GOOGLE_PLACES_API_KEY },
    apple: {
      passTypeId: env.APPLE_PASS_TYPE_ID,
      teamId: env.APPLE_TEAM_ID,
      certPem: env.APPLE_PASS_CERT_PEM,
      keyPem: env.APPLE_PASS_KEY_PEM,
      wwdrPem: env.APPLE_WWDR_PEM,
      keyPassphrase: env.APPLE_PASS_KEY_PASSPHRASE,
      p12Base64: env.APPLE_PASS_P12_BASE64,
      p12Password: env.APPLE_PASS_P12_PASSWORD,
      apnsKeyId: env.APPLE_APNS_KEY_ID,
      apnsKeyP8: env.APPLE_APNS_KEY_P8,
    },
    walletDevFake: !isProd && env.WALLET_DEV_FAKE === "1",
    experiments: { testClock: !isProd, now: env.EXPERIMENTS_NOW || undefined, lighthouseJson: env.EXPERIMENTS_LIGHTHOUSE_JSON || undefined },
    // ---- wave-n: promo ----
    ai: {
      masterKeyHex: masterKeyFrom(env.APP_ENCRYPTION_KEY),
      envKey: env.ANTHROPIC_API_KEY || undefined,
      model: env.PROMO_AI_MODEL || "claude-opus-5-5",
      models: (env.PROMO_AI_MODELS || "claude-opus-5-5,claude-haiku-5-5").split(",").map((x) => x.trim()).filter(Boolean),
      validateModel: env.PROMO_AI_VALIDATE_MODEL || "claude-haiku-5-5",
      plans: (env.PROMO_AI_PLANS || "plus,studio,pro,trial").split(",").map((x) => x.trim()).filter(Boolean),
      fake: env.PROMO_AI_FAKE === "1" && !isProd,
      effort: env.PROMO_AI_EFFORT === "medium" || env.PROMO_AI_EFFORT === "high" ? env.PROMO_AI_EFFORT : "low",
      // US dollars per million tokens (the claude-api skill's price table); unknown models are metered at the Opus price.
      prices: { "claude-opus-5-5": { inputPerM: 4, outputPerM: 20 }, "claude-haiku-5-5": { inputPerM: 0.1, outputPerM: 0.5 } },
    },
    // ---- end wave-n: promo ----
    // ---- wave-o: import ----
    siteImport: {
      aiModel: env.SITE_IMPORT_AI_MODEL || "claude-haiku-5-5",
      ai: env.SITE_IMPORT_AI !== "0",
      testHosts: isProd
        ? {}
        : Object.fromEntries(
            (env.SITE_IMPORT_TEST_HOSTS || "")
              .split(",")
              .map((p) => p.trim().split("="))
              .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1])
              .map(([h, ip]) => [h.toLowerCase(), ip]),
          ),
      userAgent: "LocalLoyaltySiteImport/1.0 (+https://localloyalty.ca/bot; reads your homepage once to fill in your profile)",
    },
    // ---- end wave-o: import ----
  };
}
