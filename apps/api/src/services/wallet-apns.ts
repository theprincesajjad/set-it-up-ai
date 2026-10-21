/**
 * APNs for Wallet pass updates: an empty JSON push to each registered device
 * token, topic = pass type identifier, authenticated with the pass
 * certificate (TLS client cert) over HTTP/2. Devices then call our PassKit
 * web service to fetch the new pass.
 */
import http2 from "node:http2";
import type { AppContext } from "../context.js";

export interface ApnsResult {
  sent: number;
  failed: number;
  /** Tokens APNs says are no longer valid (410). */
  invalid: string[];
}

export interface ApnsPusher {
  name: string;
  push(tokens: string[], topic: string): Promise<ApnsResult>;
}

export const APNS_HOST = "https://api.push.apple.com";

export function http2Apns(opts: { certPem: string; keyPem: string; passphrase?: string; host?: string }): ApnsPusher {
  return {
    name: "apns",
    async push(tokens, topic) {
      const res: ApnsResult = { sent: 0, failed: 0, invalid: [] };
      if (!tokens.length) return res;
      const client = http2.connect(opts.host ?? APNS_HOST, { cert: opts.certPem, key: opts.keyPem, passphrase: opts.passphrase });
      client.on("error", () => {});
      try {
        await Promise.all(
          tokens.map(
            (token) =>
              new Promise<void>((resolve) => {
                const req = client.request({ ":method": "POST", ":path": `/3/device/${token}`, "apns-topic": topic, "content-type": "application/json" });
                req.setTimeout(10_000, () => req.close());
                req.on("response", (headers) => {
                  const status = Number(headers[":status"]);
                  if (status === 200) res.sent++;
                  else {
                    res.failed++;
                    if (status === 410) res.invalid.push(token);
                  }
                });
                req.on("error", () => {
                  res.failed++;
                  resolve();
                });
                req.on("close", () => resolve());
                req.resume();
                req.end("{}");
              }),
          ),
        );
      } finally {
        client.close();
      }
      return res;
    },
  };
}

/** Records pushes (dev/test, or when pass certs aren't configured). */
export function consoleApns(log = false): ApnsPusher & { sent: { token: string; topic: string }[] } {
  const sent: { token: string; topic: string }[] = [];
  return {
    name: "console",
    sent,
    async push(tokens, topic) {
      for (const token of tokens) {
        sent.push({ token, topic });
        if (log) console.log(`[apns -> ${token.slice(0, 8)}…] pass update ${topic}`);
      }
      return { sent: tokens.length, failed: 0, invalid: [] };
    },
  };
}

const registry = new WeakMap<AppContext, ApnsPusher>();

export function setApnsPusher(ctx: AppContext, p: ApnsPusher) {
  registry.set(ctx, p);
}

export const pemFromEnv = (v: string | undefined) => (v ? v.replace(/\\n/g, "\n") : undefined);

export function apnsFor(ctx: AppContext): ApnsPusher {
  let p = registry.get(ctx);
  if (!p) {
    const a = ctx.config.apple;
    p =
      a.certPem && a.keyPem && ctx.config.env !== "test"
        ? http2Apns({ certPem: pemFromEnv(a.certPem)!, keyPem: pemFromEnv(a.keyPem)!, passphrase: a.keyPassphrase })
        : consoleApns(ctx.config.env === "development");
    registry.set(ctx, p);
  }
  return p;
}
