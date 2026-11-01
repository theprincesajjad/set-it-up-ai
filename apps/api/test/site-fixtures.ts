/**
 * A local web server for the website-import fixtures (test/fixtures/sites) and a few hostile hosts, plus the network seam that
 * maps fixture host names to it. Nothing here touches the real internet: fixture hosts "resolve" to a public-looking address
 * (93.184.216.34) that the dial map sends to 127.0.0.1, so the SSRF checks still run on every request.
 *
 * Also used by the e2e stack (scripts/site-fixtures-server.ts), where SITE_IMPORT_TEST_HOSTS points the hosts at 127.0.0.1.
 */
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync, gzipSync } from "node:zlib";
import type { SiteImportNet } from "../src/services/site-import/net.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sites");
export const FAKE_PUBLIC_IP = "93.184.216.34";

/** Fixture host → folder and the logo colour its generated PNGs use. */
export const SITES: Record<string, { dir: string; logo: string; gzip?: boolean }> = {
  "priya-nails.test": { dir: "squarespace-nails", logo: "#D6457A" },
  "bloor-barbers.test": { dir: "wix-barber", logo: "#7A1F2B", gzip: true },
  "maple-bean.test": { dir: "shopify-cafe", logo: "#6B4226" },
  "sunrise-bakery.test": { dir: "plain-bakery", logo: "#E07A1F" },
  "studio-verde.test": { dir: "jsonld-salon", logo: "#0F6E66" },
};
const SPECIAL = ["robots-closed.test", "redirect-metadata.test", "redirect-private-name.test", "redirect-loop.test", "huge.test", "huge-declared.test", "slow.test", "json.test", "big-logo.test"];

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A square RGBA PNG: a solid colour mark on a transparent edge (so the logo's dominant colour is that colour). */
export function makePng(hex: string, size = 96): Buffer {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const edge = x < 8 || y < 8 || x >= size - 8 || y >= size - 8;
      raw.set(edge ? [0, 0, 0, 0] : [r, g, b, 255], o);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export interface FixtureServer {
  port: number;
  origin(host: string): string;
  /** Every request, as "host path". */
  hits: string[];
  close(): Promise<void>;
}

export async function startFixtureServer(port = 0): Promise<FixtureServer> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    const hostHeader = String(req.headers.host ?? "");
    const host = hostHeader.replace(/:\d+$/, "").toLowerCase();
    const path = (req.url ?? "/").split("?")[0]!;
    hits.push(`${host} ${path}`);
    const origin = `http://${hostHeader}`;
    const send = (status: number, type: string, body: Buffer | string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": type, ...headers });
      res.end(body);
    };
    // Hostile and odd hosts.
    if (host === "robots-closed.test") return path === "/robots.txt" ? send(200, "text/plain", "User-agent: *\nDisallow: /\n") : send(200, "text/html", "<title>Closed</title>");
    if (host === "redirect-metadata.test") return path === "/robots.txt" ? send(404, "text/plain", "") : send(302, "text/html", "", { location: "http://169.254.169.254/latest/meta-data/" });
    if (host === "redirect-private-name.test") return path === "/robots.txt" ? send(404, "text/plain", "") : send(301, "text/html", "", { location: `http://internal-admin.test:${(server.address() as { port: number }).port}/` });
    if (host === "redirect-loop.test") {
      if (path === "/robots.txt") return send(404, "text/plain", "");
      const n = Number(/^\/hop(\d+)$/.exec(path)?.[1] ?? 0);
      return send(302, "text/html", "", { location: `/hop${n + 1}` });
    }
    if (host === "huge.test") {
      if (path === "/robots.txt") return send(404, "text/plain", "");
      // No content-length: the cap has to be enforced while streaming.
      res.writeHead(200, { "content-type": "text/html" });
      const block = Buffer.alloc(64 * 1024, "a");
      let sent = 0;
      const pump = () => {
        while (sent < 3 * 1024 * 1024) {
          sent += block.length;
          if (!res.write(block)) return res.once("drain", pump);
        }
        res.end();
      };
      return pump();
    }
    if (host === "huge-declared.test") return path === "/robots.txt" ? send(404, "text/plain", "") : send(200, "text/html", Buffer.alloc(2 * 1024 * 1024 + 10, "b"));
    if (host === "slow.test") {
      if (path === "/robots.txt") return send(404, "text/plain", "");
      const t = setTimeout(() => send(200, "text/html", "<title>Too late</title>"), 12_000);
      req.on("close", () => clearTimeout(t));
      return;
    }
    if (host === "json.test") return path === "/robots.txt" ? send(404, "text/plain", "") : send(200, "application/json", '{"name":"not a page"}');
    if (host === "big-logo.test") {
      if (path === "/robots.txt") return send(404, "text/plain", "");
      if (path === "/logo.png") return send(200, "image/png", Buffer.concat([makePng("#123456"), Buffer.alloc(1024 * 1024 + 100)]));
      if (path === "/small.png") return send(200, "image/png", makePng("#AA3311"));
      return send(200, "text/html", `<title>Big Logo Co</title><link rel="apple-touch-icon" href="/logo.png"><meta property="og:image" content="/small.png">`);
    }
    const site = SITES[host];
    if (!site) return send(404, "text/plain", "no such fixture host");
    const dir = join(ROOT, site.dir);
    if (path === "/robots.txt") return existsSync(join(dir, "robots.txt")) ? send(200, "text/plain", readFileSync(join(dir, "robots.txt"))) : send(404, "text/html", "<h1>Not found</h1>");
    if (/\.png$/.test(path)) return send(200, "image/png", makePng(site.logo));
    if (/\.(jpe?g|ico)$/.test(path)) return send(404, "text/plain", "");
    if (/\.css$/.test(path)) {
      const css = ["site.css", "base.css", "style.css"].map((f) => join(dir, f)).find(existsSync);
      return css ? send(200, "text/css; charset=utf-8", readFileSync(css)) : send(404, "text/plain", "");
    }
    const file = path === "/" ? join(dir, "index.html") : join(dir, `${path.replace(/\/+$/, "").replace(/\.\./g, "")}.html`);
    if (!existsSync(file)) return send(404, "text/html", "<title>Not found</title>");
    const html = readFileSync(file, "utf8").replaceAll("{{ORIGIN}}", origin);
    if (site.gzip && /gzip/.test(String(req.headers["accept-encoding"] ?? ""))) return send(200, "text/html; charset=utf-8", gzipSync(html), { "content-encoding": "gzip" });
    return send(200, "text/html; charset=utf-8", html);
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const actual = (server.address() as { port: number }).port;
  return {
    port: actual,
    origin: (host) => `http://${host}:${actual}`,
    hits,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** Fixture hosts resolve to a public-looking address; a few names resolve to private ones (the SSRF cases). */
export function fixtureNet(): SiteImportNet {
  const map: Record<string, string[]> = {
    "rebind-local.test": ["127.0.0.1"],
    "internal-admin.test": ["10.0.0.5"],
    "v6-loopback.test": ["::1"],
    "v4-mapped.test": ["::ffff:127.0.0.1"],
    "mixed.test": [FAKE_PUBLIC_IP, "192.168.1.10"],
    "metadata-v6.test": ["fd00:ec2::254"],
  };
  for (const h of [...Object.keys(SITES), ...SPECIAL]) map[h] = [FAKE_PUBLIC_IP];
  return {
    async lookup(host) {
      const r = map[host.toLowerCase()];
      if (!r) throw Object.assign(new Error(`ENOTFOUND ${host}`), { code: "ENOTFOUND" });
      return r;
    },
    dial: (address) => (address === FAKE_PUBLIC_IP ? "127.0.0.1" : address),
  };
}
