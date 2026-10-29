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
    /** APNs token auth (.p8 key from Apple Developer → Keys). Preferred; the pass certificate is the fallback. */
    apnsKeyId?: string;
    apnsKeyP8?: string;
  };
  /**
   * Landing A/B tests (services/landing-events.ts, admin-experiments.ts). Test clock: outside production, EXPERIMENTS_NOW (an ISO
   * instant) pins the experiment schedule and the x-ll-experiments-now header moves it per request (e2e/run-all.sh). Lighthouse:
   * EXPERIMENTS_LIGHTHOUSE_JSON is the path of the JSON the e2e run writes ({ "<experimentId>:<variant>" | "<variant>": score }).
   */
  experiments: { testClock: boolean; now?: string; lighthouseJson?: string };
}

function parseTrustProxy(v: string | undefined, isProd: boolean): boolean | number {
  if (v === undefined || v === "") return isProd ? 1 : true;
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : isProd ? 1 : true;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = (env.NODE_ENV as Config["env"]) ?? "development";
  const isProd = nodeEnv === "production";
  const required = (name: string, devDefault: string) => {
    const v = env[name];
    if (!v && isProd) throw new Error(`Missing required env var ${name}`);
    return v ?? devDefault;
  };
  const storageProvider = env.STORAGE_PROVIDER || (nodeEnv === "test" ? "memory" : "disk");
  if (storageProvider !== "r2" && storageProvider !== "disk" && storageProvider !== "memory") throw new Error(`STORAGE_PROVIDER must be r2, disk or memory (got "${storageProvider}")`);
  if (storageProvider === "memory" && isProd) throw new Error("STORAGE_PROVIDER=memory loses every upload on restart; use r2 or disk in production");
  const r2Missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((n) => !env[n]);
  if (storageProvider === "r2" && r2Missing.length) throw new Error(`STORAGE_PROVIDER=r2 needs ${r2Missing.join(", ")}`);
  // Customers sign in with a texted code: without Twilio the code only reaches the server log and nobody can sign in.
  // ALLOW_CONSOLE_SMS=1 is for a staging server that reads codes from its log.
  const twilioReady = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_MESSAGING_SERVICE_SID || env.TWILIO_FROM));
  if (isProd && !twilioReady && env.ALLOW_CONSOLE_SMS !== "1")
    throw new Error("Production needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM (sign-in codes are texted); set ALLOW_CONSOLE_SMS=1 only on a staging server");
  return {
    env: nodeEnv,
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? "pglite://./.pglite/dev",
    jwtSecret: required("JWT_SECRET", "dev-only-jwt-secret-change-me-dev-only-jwt-secret"),
    encryptionKey: required("ENCRYPTION_KEY", "0".repeat(64)),
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
    email: { provider: env.RESEND_API_KEY ? "resend" : "console", resendApiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM ?? "Local Loyalty <hello@localloyalty.example>" },
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
      apnsKeyId: env.APPLE_APNS_KEY_ID,
      apnsKeyP8: env.APPLE_APNS_KEY_P8,
    },
    experiments: { testClock: !isProd, now: env.EXPERIMENTS_NOW || undefined, lighthouseJson: env.EXPERIMENTS_LIGHTHOUSE_JSON || undefined },
  };
}
