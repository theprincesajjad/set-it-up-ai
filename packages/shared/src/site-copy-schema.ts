/**
 * The JSON the model must return for a site draft and for a one-line rewrite (workstream G). Sent as
 * `output_config.format = { type: "json_schema", schema }` so the API constrains the output, and checked again with zod
 * on our side (limits are trimmed, not rejected: structured outputs do not enforce string lengths).
 */
import { z } from "zod";
import { SITE_COPY_FIELDS, SITE_SECTIONS, type SiteCopyField } from "./site-presets.js";

const str = { type: "string" } as const;
const obj = <K extends string>(keys: readonly K[]) => ({
  type: "object",
  properties: Object.fromEntries(keys.map((k) => [k, str])) as Record<K, typeof str>,
  required: [...keys],
  additionalProperties: false,
});

/** JSON schema for a full draft: section order plus every line of copy. */
export const SITE_DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    order: { type: "array", items: { type: "string", enum: [...SITE_SECTIONS] } },
    copy: {
      type: "object",
      properties: {
        hero: obj(["headline", "subhead", "cta"]),
        about: obj(["title", "body"]),
        services: obj(["title", "intro"]),
        reviews: obj(["title"]),
        loyalty: obj(["title", "body"]),
        promos: obj(["title", "intro"]),
        hours: obj(["title"]),
        map: obj(["title", "note"]),
        contact: obj(["title", "body"]),
        seo: obj(["title", "description"]),
      },
      required: ["hero", "about", "services", "reviews", "loyalty", "promos", "hours", "map", "contact", "seo"],
      additionalProperties: false,
    },
  },
  required: ["order", "copy"],
  additionalProperties: false,
} as const;

/** JSON schema for a one-line rewrite. */
export const SITE_LINE_JSON_SCHEMA = { type: "object", properties: { text: str }, required: ["text"], additionalProperties: false } as const;

const line = z.string();
export const siteDraftOutput = z.object({
  order: z.array(z.string()).max(20),
  copy: z.object({
    hero: z.object({ headline: line, subhead: line, cta: line }),
    about: z.object({ title: line, body: line }),
    services: z.object({ title: line, intro: line }),
    reviews: z.object({ title: line }),
    loyalty: z.object({ title: line, body: line }),
    promos: z.object({ title: line, intro: line }),
    hours: z.object({ title: line }),
    map: z.object({ title: line, note: line }),
    contact: z.object({ title: line, body: line }),
    seo: z.object({ title: line, description: line }),
  }),
});
export type SiteDraftOutput = z.infer<typeof siteDraftOutput>;

export const siteLineOutput = z.object({ text: z.string().min(1) });

/** The limit for a field, for the prompt ("at most 70 characters"). */
export function fieldLimit(field: SiteCopyField): number {
  return SITE_COPY_FIELDS[field];
}
