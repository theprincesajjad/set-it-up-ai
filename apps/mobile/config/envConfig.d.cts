export type AppVariant = "development" | "preview" | "production";
/** process.env or a subset of it: EXPO_PUBLIC_API_URL, EXPO_PUBLIC_WEB_URL, EXPO_PUBLIC_SUPPORT_EMAIL. */
export type MobileEnv = Record<string, string | undefined>;
export function isPlaceholderHost(host: string): boolean;
export function hostOf(url: string): string | null;
export function configProblems(env: MobileEnv, variant: AppVariant): string[];
export function assertConfig(env: MobileEnv, variant: AppVariant): void;
export function linkHost(env: MobileEnv): string | null;
export const APP_LINK_PREFIXES: readonly ["/s/", "/q/", "/j/"];
export function variantOf(raw: string | undefined): AppVariant;
