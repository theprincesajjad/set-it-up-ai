import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => env.close());

describe("cors", () => {
  it("lets a browser on another origin send PATCH and DELETE (the web pass and the shopper app's web build)", async () => {
    for (const method of ["PATCH", "DELETE", "PUT"]) {
      const r = await env.app.inject({ method: "OPTIONS", url: "/v1/me", headers: { origin: "http://localhost:3701", "access-control-request-method": method, "access-control-request-headers": "authorization,content-type" } });
      expect(r.statusCode).toBe(204);
      expect(String(r.headers["access-control-allow-methods"])).toContain(method);
    }
  });
});
