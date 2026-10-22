/**
 * Social cards render in Bricolage Grotesque 800 like the site's headlines (polish-audit B1), not the
 * ImageResponse default sans. The TTF ships in @ll/design-tokens (OFL). If it can't be read (unusual
 * deploys), the card falls back to the default face instead of failing.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

let cached: Promise<ArrayBuffer | null> | null = null;

export function displayFont(): Promise<ArrayBuffer | null> {
  cached ??= (async () => {
    for (const base of [process.cwd(), join(process.cwd(), "apps/web")]) {
      try {
        const buf = await readFile(join(base, "../../packages/design-tokens/assets/fonts/BricolageGrotesque_800ExtraBold.ttf"));
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      } catch {
        /* try the next base */
      }
    }
    return null;
  })();
  return cached;
}

/** ImageResponse `fonts` option for the display face (empty when unavailable). */
export async function ogFonts(): Promise<{ name: string; data: ArrayBuffer; weight: 800; style: "normal" }[]> {
  const data = await displayFont();
  return data ? [{ name: "Bricolage Grotesque", data, weight: 800, style: "normal" }] : [];
}
