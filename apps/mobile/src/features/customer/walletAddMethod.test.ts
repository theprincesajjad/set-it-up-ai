import { describe, expect, it } from "vitest";
import { addMethodFor, passKitErrorKind } from "./walletAddMethod";

describe("wallet add method", () => {
  it("iOS uses the in-app PassKit sheet when the module is in the build, else the signed link; Android the Google save link", () => {
    expect(addMethodFor("ios", true)).toBe("passkit");
    expect(addMethodFor("ios", false)).toBe("link");
    expect(addMethodFor("android", false)).toBe("google-link");
    expect(addMethodFor("android", true)).toBe("google-link");
    expect(addMethodFor("web", false)).toBeNull();
  });

  it("maps native errors: not configured or a device that can't hold passes hides the button; the rest is a retry", () => {
    expect(passKitErrorKind("ERR_NOT_CONFIGURED")).toBe("unavailable");
    expect(passKitErrorKind("ERR_CANNOT_ADD")).toBe("unavailable");
    expect(passKitErrorKind("ERR_NETWORK")).toBe("failed");
    expect(passKitErrorKind(undefined)).toBe("failed");
  });
});
