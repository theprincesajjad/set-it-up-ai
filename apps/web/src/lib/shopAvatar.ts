/** Shop avatar helpers (server-safe: used by OG images as well as <ShopLogo>). */
/** "Pinecone Coffee Co." → "PC"; one word → first two letters. */
export function shopInitials(name: string): string {
  const words = name.replace(/['’]/g, "").replace(/[^\p{L}\p{N}\s&]/gu, " ").split(/\s+/).filter((w) => w && !/^(the|and|&|of|co|inc|ltd)$/i.test(w));
  if (!words.length) return (name.trim()[0] ?? "?").toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Black or white text on a hex background (WCAG relative luminance). */
export function onColor(hex: string): "#FFFFFF" | "#0B0B0C" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#0B0B0C" : "#FFFFFF";
}

