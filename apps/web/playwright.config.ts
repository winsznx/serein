import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests.
 *
 * By default these run against a locally built production server, so what is tested is what ships
 * rather than the dev server. Set `SEREIN_E2E_BASE_URL` to point them at the deployed Worker instead
 * — the same specs are used as the post-deploy smoke test.
 *
 * Wallet-dependent flows are covered by the contract suite and the live campaign, both of which use
 * real signers. These specs cover what a visitor sees before connecting anything, which is exactly
 * where a privacy product can most easily lie: rendering an undisclosed value as a number.
 */
const baseURL = process.env.SEREIN_E2E_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
    {
      name: "narrow",
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 640 } },
    },
  ],
  ...(process.env.SEREIN_E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: "pnpm build && pnpm start --port 3100",
          url: baseURL,
          timeout: 300_000,
          reuseExistingServer: !process.env.CI,
        },
      }),
});
