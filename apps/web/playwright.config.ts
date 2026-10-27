import { defineConfig, devices } from "@playwright/test";
import "./e2e/test-clock";

/**
 * Drives the real app against a running, seeded API. Start both first (see docs/engineering/web.md):
 *   API:  PORT=4100 pnpm --filter @ll/api dev        (after pnpm --filter @ll/api seed)
 *   Web:  NEXT_PUBLIC_API_URL=http://localhost:4100 OTP_AUTOFILL=1 pnpm --filter @ll/web start   (port 3100)
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3100",
    trace: "off",
    ...devices["Pixel 7"],
    // Chromium is preinstalled (PLAYWRIGHT_BROWSERS_PATH); never run `playwright install`.
    browserName: "chromium",
  },
});
