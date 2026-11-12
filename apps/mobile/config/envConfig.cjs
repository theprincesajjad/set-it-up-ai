/**
 * Build-time configuration rules for app.config.ts (runs under Node when the app is built; Expo does not transpile
 * local TypeScript imported from the config, so this is plain CommonJS with types in envConfig.d.cts).
 *
 * Development builds fall back to localhost so `expo start` works with no setup. Preview and production builds never do: a missing
 * or placeholder host (".example", localhost, an emulator address) is a build error, so a store build cannot ship pointing nowhere.
 */
"use strict";

const trim = (v) => (v ?? "").trim().replace(/\/+$/, "");

/** True for a host that cannot serve real users: reserved test TLDs, localhost, loopback, emulator and private LAN addresses. */
function isPlaceholderHost(host) {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (!h) return true;
  if (h === "localhost" || h === "10.0.2.2" || h === "::1" || /^127\./.test(h) || /^192\.168\./.test(h) || /^10\./.test(h)) return true;
  return /(^|\.)(example|invalid|test|localhost)$/.test(h) || /(^|\.)example\.(com|org|net)$/.test(h);
}

function hostOf(url) {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1] : null;
}

/** An https URL on a real host, or the reason it is not. */
function checkUrl(name, value) {
  if (!value) return `${name} is not set`;
  const host = hostOf(value);
  if (!host) return `${name} is not a URL (${value})`;
  if (!/^https:\/\//i.test(value)) return `${name} must be https (${value})`;
  if (isPlaceholderHost(host)) return `${name} is a placeholder host (${value}); use the real one`;
  return null;
}

function isPlaceholderEmail(address) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return true;
  return isPlaceholderHost(address.split("@")[1]);
}

/** Problems that must stop a preview or production build. Empty for development. */
function configProblems(env, variant) {
  if (variant === "development") return [];
  const problems = [];
  const api = checkUrl("EXPO_PUBLIC_API_URL", trim(env.EXPO_PUBLIC_API_URL));
  if (api) problems.push(api);
  const web = checkUrl("EXPO_PUBLIC_WEB_URL", trim(env.EXPO_PUBLIC_WEB_URL));
  if (web) problems.push(web);
  const mail = trim(env.EXPO_PUBLIC_SUPPORT_EMAIL);
  if (!mail) problems.push("EXPO_PUBLIC_SUPPORT_EMAIL is not set");
  else if (isPlaceholderEmail(mail)) problems.push(`EXPO_PUBLIC_SUPPORT_EMAIL is a placeholder (${mail}); use a real, monitored address`);
  return problems;
}

/** Throws one loud error listing everything wrong. */
function assertConfig(env, variant) {
  const problems = configProblems(env, variant);
  if (problems.length) {
    throw new Error(`Cannot build the ${variant} app with this configuration:\n - ${problems.join("\n - ")}\nSet these in the EAS environment for this profile (see docs/engineering/mobile.md).`);
  }
}

/** Where the universal links point: the web host, or null when it is not a real one (development). */
function linkHost(env) {
  const host = hostOf(trim(env.EXPO_PUBLIC_WEB_URL));
  return host && !isPlaceholderHost(host) ? host : null;
}

/** Paths the app opens from a web link. /i/ (invoice payment) is a web page with no screen in the app, so it stays in the browser. */
const APP_LINK_PREFIXES = ["/s/", "/q/", "/j/"];

function variantOf(raw) {
  return raw === "production" || raw === "preview" ? raw : "development";
}

module.exports = { isPlaceholderHost, hostOf, configProblems, assertConfig, linkHost, variantOf, APP_LINK_PREFIXES };
