import type { z } from "zod";
import { badRequest } from "./errors.js";

/** Parse untrusted input with a zod schema; throws a 400 with field errors. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw badRequest(
      "Some of what you entered isn't right. Check the form and try again.",
      r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return r.data;
}
