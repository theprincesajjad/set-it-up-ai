import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { fieldErrors } from "./fieldErrors";

const t = (key: string, vars?: Record<string, unknown>) => `${key}${vars ? JSON.stringify(vars) : ""}`;

describe("fieldErrors", () => {
  it("names each bad field once, by code", () => {
    const e = new ApiError(400, "bad_request", "Invalid", [
      { path: "email", message: "Invalid email", code: "email" },
      { path: "email", message: "second", code: "required" },
      { path: "name", message: "Too short", code: "too_short", min: 2 },
      { path: "birthday", message: "Invalid", code: "weird" },
      { path: "postalCode", message: "Enter a Canadian postal code like M6R 2K3" },
    ]);
    expect(fieldErrors(e, t as never, "ur")).toEqual({ email: "err.field.email", name: 'err.field.tooShort{"min":2}', birthday: "err.field.invalid", postalCode: "err.field.invalid" });
    // English keeps the API's own sentence for a custom rule; never in the other languages.
    expect(fieldErrors(e, t as never, "en").postalCode).toBe("Enter a Canadian postal code like M6R 2K3");
  });
  it("is empty for anything that names no field", () => {
    expect(fieldErrors(new ApiError(500, "internal", "x"), t as never)).toEqual({});
    expect(fieldErrors(new ApiError(400, "bad_request", "x"), t as never)).toEqual({});
    expect(fieldErrors(new Error("x"), t as never)).toEqual({});
  });
});
