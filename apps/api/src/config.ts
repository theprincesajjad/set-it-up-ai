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
  /** Merchants need this many active members to count as "activated". */
  activationThreshold: number;
  sms: { provider: "console" | "twilio"; twilioAccountSid?: string; twilioAuthToken?: string; twilioFrom?: string; twilioMessagingServiceSid?: string };
  email: { provider: "console" | "resend"; resendApiKey?: string; from: string };
  push: { provider: "console" | "expo"; expoAccessToken?: string };
  stripe: { secretKey?: string; webhookSecret?: string; prices: { plusMonthly?: string; plusAnnual?: string; proMonthly?: string; proAnnual?: string } };
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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = (env.NODE_ENV as Config["env"]) ?? "development";
  const isProd = nodeEnv === "production";
  const required = (name: string, devDefault: string) => {
    const v = env[name];
    if (!v && isProd) throw new Error(`Missing required env var ${name}`);
    return v ?? devDefault;
  };
  return {
    env: nodeEnv,
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? "pglite://./.pglite/dev",
    jwtSecret: required("JWT_SECRET", "dev-only-jwt-secret-change-me-dev-only-jwt-secret"),
    encryptionKey: required("ENCRYPTION_KEY", "0".repeat(64)),
    publicApiUrl: env.PUBLIC_API_URL ?? "http://localhost:4000",
    publicWebUrl: env.PUBLIC_WEB_URL ?? "http://localhost:3000",
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:8081").split(",").map((s) => s.trim()),
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
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      prices: {
        plusMonthly: env.STRIPE_PRICE_PLUS_MONTHLY,
        plusAnnual: env.STRIPE_PRICE_PLUS_ANNUAL,
        proMonthly: env.STRIPE_PRICE_PRO_MONTHLY,
        proAnnual: env.STRIPE_PRICE_PRO_ANNUAL,
      },
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
  };
}
