/**
 * Map style for the network map (foundations.md "The map is the canvas"): OpenFreeMap positron
 * (free, no key; override with NEXT_PUBLIC_MAP_STYLE_URL) restyled with the shared Corner palette
 * from @ll/design-tokens (`cornerMapStyle`). Categories come from the tokens too
 * (`MAP_CATEGORIES`, `verticalCategory`), so web and native filter identically.
 */
import { MAP_BASE_STYLE_URL, MAP_CATEGORIES, cornerMapStyle, verticalCategory, type MapCategoryId, type MapMode } from "@ll/design-tokens";

export { MAP_CATEGORIES, verticalCategory, type MapCategoryId };

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || MAP_BASE_STYLE_URL;

export function mapMode(): MapMode {
  if (typeof document === "undefined") return "light";
  const forced = document.documentElement.dataset.theme;
  if (forced === "dark" || forced === "light") return forced;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Fetch the base style JSON and return the Corner-styled style object for maplibre. */
export async function loadCornerStyle(mode: MapMode = mapMode(), url = MAP_STYLE_URL, signal?: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`style ${res.status}`);
  const base = (await res.json()) as { layers?: { id: string; type: string; [k: string]: unknown }[] };
  return cornerMapStyle(base, mode);
}

/** Does a shop belong in a rail category? ("all" → every shop). */
export function inCategory(vertical: string, c: MapCategoryId): boolean {
  return c === "all" || verticalCategory(vertical) === c;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
