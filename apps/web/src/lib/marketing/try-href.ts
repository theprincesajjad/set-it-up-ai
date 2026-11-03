/** Client-safe: the try-it card maker's hand-off into signup (lib/marketing/try-card.ts has the data). No imports, so the island stays small. */

/**
 * The sign-up link for what the owner made. The shop name is trimmed and capped like signupPrefill caps it; the colour goes only when
 * it is not the trade's own (signup then keeps "the trade's colour").
 */
export function tryHref(input: { name: string; vertical: string; colour: string | null }): string {
  const q = new URLSearchParams();
  const name = input.name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120);
  if (name) q.set("shop", name);
  q.set("vertical", input.vertical);
  if (input.colour && /^#[0-9A-F]{6}$/i.test(input.colour)) q.set("color", input.colour.slice(1).toUpperCase());
  q.set("src", "home-try");
  return `/signup?${q.toString()}`;
}
