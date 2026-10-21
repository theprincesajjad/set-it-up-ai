import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests cover pure modules only (API client, offline queue, phone
// formatting, counter award flow). They never import react-native, so they
// run in plain Node without a simulator or jest-expo.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
