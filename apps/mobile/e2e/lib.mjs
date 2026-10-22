// Shared helpers for the Expo web screenshot tour (see e2e/README.md).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
export const API = process.env.E2E_API_URL ?? "http://localhost:4300";

export async function call(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

export const login = async (email, password = "localloyalty-demo") => (await call("POST", "/v1/auth/login", { email, password })).accessToken;

export async function customerToken(phone) {
  const { devCode } = await call("POST", "/v1/auth/otp/start", { phone });
  return (await call("POST", "/v1/auth/otp/verify", { phone, code: devCode })).accessToken;
}

/**
 * Map tiles (OpenFreeMap) are fetched by curl, which uses the machine's proxy and CA bundle,
 * and handed to Chromium with page.route, so the browser never needs network access or a TLS bypass.
 * Cached on disk between runs.
 */
const cacheDir = join(tmpdir(), "ll-mobile-e2e-tiles");
export async function routeTiles(context) {
  await mkdir(cacheDir, { recursive: true });
  await context.route(/^https:\/\/tiles\.openfreemap\.org\//, async (route) => {
    const url = route.request().url();
    const key = join(cacheDir, createHash("sha1").update(url).digest("hex"));
    try {
      let body;
      let type;
      try {
        body = await readFile(key);
        type = (await readFile(`${key}.type`, "utf8")).trim();
      } catch {
        const out = await run("curl", ["-sS", "-L", "--max-time", "20", "-w", "\n%{http_code} %{content_type}", "-o", key, url], { encoding: "utf8" });
        const [code, ...ct] = out.stdout.trim().split(" ");
        if (code !== "200") return route.fulfill({ status: Number(code) || 502, body: "" });
        type = ct.join(" ") || "application/octet-stream";
        await writeFile(`${key}.type`, type);
        body = await readFile(key);
      }
      await route.fulfill({ status: 200, body, headers: { "content-type": type, "access-control-allow-origin": "*" } });
    } catch {
      await route.fulfill({ status: 502, body: "" });
    }
  });
}
