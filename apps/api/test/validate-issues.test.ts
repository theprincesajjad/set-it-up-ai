import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parse } from "../src/lib/validate.js";
import { HttpError } from "../src/lib/errors.js";

function issues(schema: z.ZodType, input: unknown) {
  try {
    parse(schema, input);
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    const err = e as HttpError;
    expect(err.statusCode).toBe(400);
    return err.details as { path: string; message: string; code: string; min?: number; max?: number }[];
  }
  throw new Error("expected a 400");
}

describe("validation details", () => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8, "Use at least 8 characters"),
    name: z.string().min(1),
    qty: z.number().int().max(200),
    tags: z.array(z.string()).min(1),
  });

  it("says each problem in plain English with a code, never the library's sentence", () => {
    const d = issues(schema, { email: "x", password: "a", name: "", qty: 300.5, tags: [] });
    const by = Object.fromEntries(d.map((i) => [i.path, i]));
    expect(by.email).toMatchObject({ code: "email", message: "Enter a valid email address." });
    expect(by.password).toMatchObject({ code: "too_short", min: 8, message: "Use at least 8 characters" });
    expect(by.name).toMatchObject({ code: "required", message: "This is required." });
    expect(by.qty).toMatchObject({ code: "int", message: "Enter a whole number." });
    expect(by.tags).toMatchObject({ code: "required" });
    for (const i of d) expect(i.message).not.toMatch(/Invalid input|Too small|Too big|expected/);
  });

  it("treats a missing field as required and reports the limit for a number that is too big", () => {
    const d = issues(schema, { email: "a@b.ca", password: "longenough", qty: 500, tags: ["a"] });
    const by = Object.fromEntries(d.map((i) => [i.path, i]));
    expect(by.name).toMatchObject({ code: "required" });
    expect(by.qty).toMatchObject({ code: "max", max: 200, message: "Use 200 or less." });
  });

  it("uses one calm sentence for the top-level message", () => {
    try {
      parse(schema, {});
    } catch (e) {
      expect((e as HttpError).message).toBe("Check the highlighted fields and try again.");
    }
  });
});
