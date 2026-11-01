/**
 * The website import's network guard (SSRF). Every request the import makes (pages, robots.txt, stylesheets, the logo) goes
 * through `guardedGet`:
 *
 *  - http and https only; no user name or password in the address.
 *  - The host is resolved here and EVERY address it resolves to must be public: loopback, private (RFC 1918), carrier-grade NAT,
 *    link-local (169.254/16, which is where cloud metadata lives), multicast, reserved, the unspecified address, and the IPv6
 *    equivalents (::1, fc00::/7, fe80::/10, ff00::/8, IPv4-mapped and NAT64 forms of a blocked IPv4) are refused. The request
 *    then connects to the address that was checked (never a second lookup), so DNS rebinding cannot swap it.
 *  - Redirects are followed by hand, at most 3, and each new address goes through the same checks.
 *  - One deadline for the whole import (8 s), a byte cap per response (2 MB for pages) counted on the decompressed body, and a
 *    content-type allow-list per kind (HTML for pages, CSS for stylesheets, raster images for the logo).
 *  - A User-Agent that names the product, and no cookies.
 *
 * Tests and the e2e stack reach local fixture sites through `SiteImportNet` (a lookup and a dial map) or SITE_IMPORT_TEST_HOSTS
 * (never in production); the checks themselves are the same.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import zlib from "node:zlib";
import type { AppContext } from "../../context.js";
import { HttpError } from "../../lib/errors.js";

export interface SiteImportNet {
  /** Every address a host name resolves to. */
  lookup(host: string): Promise<string[]>;
  /** The address actually connected to, after the checks (tests: a public fixture address → 127.0.0.1). */
  dial?(address: string): string;
}

export const MAX_REDIRECTS = 3;
export const TOTAL_TIMEOUT_MS = 8000;
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

export type ImportErrorCode = "bad_url" | "blocked_address" | "timeout" | "too_large" | "wrong_type" | "fetch_failed" | "too_many_redirects" | "robots";

export class SiteImportError extends HttpError {
  constructor(public reason: ImportErrorCode, message: string) {
    super(422, `site_import_${reason}`, message);
  }
}

const v4 = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  v4.addSubnet(net, bits, "ipv4");
const v6 = new BlockList();
for (const [net, bits] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
  ["100::", 64],
] as const)
  v6.addSubnet(net, bits, "ipv6");

/** Is this address somewhere the import must never connect to? */
export function isBlockedAddress(address: string): boolean {
  const a = address.replace(/^\[|\]$/g, "").split("%")[0]!;
  const kind = isIP(a);
  if (kind === 4) return v4.check(a, "ipv4");
  if (kind !== 6) return true;
  const lower = a.toLowerCase();
  // IPv4-mapped (::ffff:127.0.0.1), IPv4-compatible (::127.0.0.1) and NAT64 (64:ff9b::7f00:1): judge the IPv4 inside.
  const embedded = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower)?.[1] ?? embeddedHex(lower);
  if (embedded) return v4.check(embedded, "ipv4");
  return v6.check(a, "ipv6");
}

function embeddedHex(a: string): string | null {
  const m = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
  if (!m) return null;
  const hi = parseInt(m[1]!, 16);
  const lo = parseInt(m[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** A URL the import may request: http(s), a host, no credentials. Throws SiteImportError otherwise. */
export function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SiteImportError("bad_url", "That doesn't look like a web address.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SiteImportError("bad_url", "Only http and https web addresses can be read.");
  if (u.username || u.password) throw new SiteImportError("bad_url", "Leave the user name and password out of the address.");
  if (!u.hostname) throw new SiteImportError("bad_url", "That doesn't look like a web address.");
  return u;
}

const defaultNet: SiteImportNet = {
  async lookup(host) {
    const r = await dnsLookup(host, { all: true, verbatim: true });
    return r.map((x) => x.address);
  },
};

export function siteImportNet(ctx: AppContext): SiteImportNet {
  return ctx.providers.siteImportNet ?? defaultNet;
}

/** Resolve and check a host; returns the address to connect to. */
export async function resolveSafe(ctx: AppContext, host: string): Promise<string> {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  const pinned = ctx.config.siteImport.testHosts[h];
  if (pinned) return pinned;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) throw new SiteImportError("blocked_address", "That address points inside a private network, so we can't read it.");
  const net = siteImportNet(ctx);
  let addrs: string[];
  if (isIP(h)) addrs = [h];
  else {
    try {
      addrs = await net.lookup(h);
    } catch {
      throw new SiteImportError("fetch_failed", "We couldn't find that website. Check the address.");
    }
  }
  if (!addrs.length) throw new SiteImportError("fetch_failed", "We couldn't find that website. Check the address.");
  if (addrs.some(isBlockedAddress)) throw new SiteImportError("blocked_address", "That address points inside a private network, so we can't read it.");
  return net.dial ? net.dial(addrs[0]!) : addrs[0]!;
}

export interface GuardedResponse {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

export interface GetOptions {
  deadline: number;
  maxBytes: number;
  /** Content types this request may return (lower-case, without parameters). */
  types: readonly string[];
  accept: string;
  /** Statuses returned instead of thrown (robots.txt reads its 404). */
  passStatus?: (status: number) => boolean;
}

export const HTML_TYPES = ["text/html", "application/xhtml+xml"] as const;
export const CSS_TYPES = ["text/css"] as const;
export const IMAGE_TYPES_OK = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon", "application/octet-stream"] as const;
export const TEXT_TYPES = ["text/plain"] as const;

/** GET with the SSRF guard, redirects by hand, the deadline and the byte cap. */
export async function guardedGet(ctx: AppContext, raw: string, o: GetOptions): Promise<GuardedResponse> {
  let url = checkUrl(raw);
  for (let hop = 0; ; hop++) {
    const address = await resolveSafe(ctx, url.hostname);
    const left = o.deadline - Date.now();
    if (left <= 0) throw new SiteImportError("timeout", "That website took too long to answer.");
    const res = await requestOnce(ctx, url, address, left, o);
    if (res.status >= 300 && res.status < 400 && res.location) {
      if (hop >= MAX_REDIRECTS) throw new SiteImportError("too_many_redirects", "That website redirects too many times.");
      url = checkUrl(new URL(res.location, url).toString());
      continue;
    }
    if (o.passStatus?.(res.status)) return { url: url.toString(), status: res.status, contentType: res.contentType, body: res.body };
    if (res.status < 200 || res.status >= 300) throw new SiteImportError("fetch_failed", "That website didn't open. Check the address and try again.");
    if (!o.types.includes(res.contentType)) throw new SiteImportError("wrong_type", "That address isn't a web page we can read.");
    return { url: url.toString(), status: res.status, contentType: res.contentType, body: res.body };
  }
}

interface RawResponse {
  status: number;
  location: string | null;
  contentType: string;
  body: Buffer;
}

function requestOnce(ctx: AppContext, url: URL, address: string, timeoutMs: number, o: GetOptions): Promise<RawResponse> {
  const lib = url.protocol === "https:" ? https : http;
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  return new Promise<RawResponse>((resolve, reject) => {
    let settled = false;
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      reject(e);
    };
    const timer = setTimeout(() => fail(new SiteImportError("timeout", "That website took too long to answer.")), timeoutMs);
    const req = lib.request(
      {
        // The checked IP itself, never the name: no second DNS lookup between the check and the connection (no rebinding).
        host: address,
        port,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        headers: { host: url.host, "user-agent": ctx.config.siteImport.userAgent, accept: o.accept, "accept-encoding": "gzip, deflate, br", "accept-language": "en-CA,en;q=0.8" },
        ...(url.protocol === "https:" && !isIP(url.hostname) ? { servername: url.hostname } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ status, location: typeof res.headers.location === "string" ? res.headers.location : null, contentType, body: Buffer.alloc(0) });
          return;
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > o.maxBytes) return fail(new SiteImportError("too_large", "That page is too big to read."));
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream = enc === "gzip" || enc === "x-gzip" ? res.pipe(zlib.createGunzip()) : enc === "deflate" ? res.pipe(zlib.createInflate()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on("data", (c: Buffer) => {
          total += c.length;
          if (total > o.maxBytes) return fail(new SiteImportError("too_large", "That page is too big to read."));
          chunks.push(c);
        });
        stream.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ status, location: null, contentType, body: Buffer.concat(chunks) });
        });
        stream.on("error", () => fail(new SiteImportError("fetch_failed", "That website didn't open. Check the address and try again.")));
        res.on("error", () => fail(new SiteImportError("fetch_failed", "That website didn't open. Check the address and try again.")));
      },
    );
    req.on("error", () => fail(new SiteImportError("fetch_failed", "That website didn't open. Check the address and try again.")));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------
export interface RobotsRules {
  allow(path: string): boolean;
}

const ALLOW_ALL: RobotsRules = { allow: () => true };
const DENY_ALL: RobotsRules = { allow: () => false };

/** Our token in robots.txt: a group for `LocalLoyaltySiteImport` (or `LocalLoyalty`) wins over `*`. */
export function parseRobots(text: string, agent = "localloyaltysiteimport"): RobotsRules {
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!;
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && cur) {
      lastWasAgent = false;
      if (key === "disallow" && !val) continue; // "Disallow:" allows everything
      cur.rules.push({ allow: key === "allow", path: val });
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && (agent.startsWith(a) || a.startsWith("localloyalty"))));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  if (!rules.length) return ALLOW_ALL;
  const toRe = (p: string) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
  const compiled = rules.map((r) => ({ ...r, re: toRe(r.path), len: r.path.length }));
  return {
    allow(path) {
      let best: { allow: boolean; len: number } | null = null;
      for (const r of compiled) if (r.re.test(path) && (!best || r.len > best.len || (r.len === best.len && r.allow))) best = r;
      return best ? best.allow : true;
    },
  };
}

/** Fetch and parse an origin's robots.txt. Missing (4xx) = allow everything; a server error = allow nothing (RFC 9309). */
export async function robotsFor(ctx: AppContext, origin: string, deadline: number): Promise<RobotsRules> {
  try {
    const r = await guardedGet(ctx, `${origin}/robots.txt`, { deadline, maxBytes: 256 * 1024, types: [...TEXT_TYPES, ...HTML_TYPES, "application/octet-stream", ""], accept: "text/plain", passStatus: (s) => s >= 400 });
    if (r.status >= 500) return DENY_ALL;
    if (r.status >= 400) return ALLOW_ALL;
    if (HTML_TYPES.includes(r.contentType as (typeof HTML_TYPES)[number])) return ALLOW_ALL; // a site that answers every path with its homepage
    return parseRobots(r.body.toString("utf8"));
  } catch (e) {
    if (e instanceof SiteImportError && (e.reason === "blocked_address" || e.reason === "timeout")) throw e;
    return ALLOW_ALL; // unreachable robots.txt: treated as missing
  }
}
