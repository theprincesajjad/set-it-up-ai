/**
 * Helpers for WhatsApp offer templates. Festival templates (`@ll/shared` festivals.ts) use named
 * placeholders; Meta wants numbered variables ({{1}}, {{2}}) in the order they first appear, and
 * broadcasts send the values for those numbers in `params`.
 */
import { FESTIVALS, formatFestivalDate, type FestivalDef, type FestivalTemplate } from "@ll/shared";

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Plain-English name for each placeholder, for the "what goes in {{1}}" line. */
export const VAR_LABEL: Record<string, string> = {
  first_name: "the customer's first name",
  merchant: "your shop name",
  festival_date: "the festival date",
};

/** Placeholder names in order of first appearance. */
export function placeholders(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(VAR_RE)) if (!seen.includes(m[1]!)) seen.push(m[1]!);
  return seen;
}

/** Text with named placeholders turned into {{1}}, {{2}}..., plus which name each number stands for. */
export function metaTemplate(text: string): { text: string; vars: string[] } {
  const vars = placeholders(text);
  return { text: text.replace(VAR_RE, (_, n: string) => `{{${vars.indexOf(n) + 1}}}`), vars };
}

/** Values for a template's variables when sending: per-customer ones stay as placeholders, the date is filled in. */
export function festivalParams(text: string, startDate: string): string[] {
  return placeholders(text).map((n) => (n === "festival_date" ? formatFestivalDate(startDate) : `{{${n}}}`));
}

export interface OfferTemplate {
  name: string;
  festival: FestivalDef;
  template: FestivalTemplate;
}

/** One entry per suggested WhatsApp template name across the festival calendar. */
export const OFFER_TEMPLATES: OfferTemplate[] = FESTIVALS.flatMap((festival) => festival.templates.map((template) => ({ name: template.whatsappTemplateName, festival, template }))).filter((t, i, all) => all.findIndex((o) => o.name === t.name) === i);

export const findOfferTemplate = (name: string) => OFFER_TEMPLATES.find((t) => t.name === name);
