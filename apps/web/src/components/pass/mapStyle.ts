/**
 * Map style + palette for the network map. Default: OpenFreeMap "positron" (free, no key),
 * override with NEXT_PUBLIC_MAP_STYLE_URL. `muteStyle` nudges the vector style toward the paper
 * palette (brand.md): warm paper land, soft lake water, pine-tinted parks, no POI clutter.
 */
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron";

export const MAP_PALETTE = { land: "#F4EFE6", water: "#D3E1E4", park: "#E1E9DC", building: "#EAE3D8", road: "#FFFFFF", minor: "#FBF8F2", label: "#655A4C" } as const;

type Layer = { id: string; type: string; "source-layer"?: string };
interface StyleMap {
  getStyle(): { layers?: Layer[] } | undefined;
  setPaintProperty(id: string, prop: string, value: unknown): void;
  setLayoutProperty(id: string, prop: string, value: unknown): void;
}

export function layerRole(l: Layer): "background" | "water" | "park" | "building" | "road" | "poi" | "label" | null {
  const id = `${l.id} ${l["source-layer"] ?? ""}`.toLowerCase();
  if (l.type === "background") return "background";
  if (l.type === "symbol") return /poi|aerodrome|airport|housenum/.test(id) ? "poi" : "label";
  if (/water|ocean|lake|river/.test(id)) return "water";
  if (/park|wood|grass|landcover|landuse_(park|cemetery)|green/.test(id)) return "park";
  if (/building/.test(id)) return "building";
  if (/road|street|highway|transportation|bridge|tunnel/.test(id) && l.type === "line") return "road";
  return null;
}

export function muteStyle(map: StyleMap) {
  for (const l of map.getStyle()?.layers ?? []) {
    const role = layerRole(l);
    try {
      if (role === "background") map.setPaintProperty(l.id, "background-color", MAP_PALETTE.land);
      else if (role === "water" && l.type === "fill") map.setPaintProperty(l.id, "fill-color", MAP_PALETTE.water);
      else if (role === "park" && l.type === "fill") map.setPaintProperty(l.id, "fill-color", MAP_PALETTE.park);
      else if (role === "building" && l.type === "fill") map.setPaintProperty(l.id, "fill-color", MAP_PALETTE.building);
      else if (role === "poi") map.setLayoutProperty(l.id, "visibility", "none");
      else if (role === "label") map.setPaintProperty(l.id, "text-color", MAP_PALETTE.label);
    } catch {
      /* layer without that property: keep the style's value */
    }
  }
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Category chips over the map (references.md §1), mapped from verticals. */
export const MAP_CATEGORIES: { id: string; label: string; verticals: string[] }[] = [
  { id: "coffee", label: "Coffee", verticals: ["cafe", "bakery"] },
  { id: "food", label: "Food", verticals: ["restaurant", "bar", "grocery"] },
  { id: "shops", label: "Shops", verticals: ["retail", "bookstore", "florist", "pet", "pharmacy"] },
  { id: "services", label: "Services", verticals: ["dry_cleaning", "alterations", "print_shop", "fitness", "other"] },
  { id: "repair", label: "Repair", verticals: ["repair_electronics", "repair_auto"] },
  { id: "beauty", label: "Beauty", verticals: ["salon", "barber", "spa"] },
];
