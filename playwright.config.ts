import fs from "node:fs";
import { defineConfig, devices, chromium } from "@playwright/test";

const executablePath = process.env.FLOWSTATE_CHROMIUM_PATH ?? chromium.executablePath();
if (!fs.existsSync(executablePath)) {
  throw new Error(
    `Scratch Pad browser preflight failed: Chromium was not found at ${executablePath}. ` +
      "Set FLOWSTATE_CHROMIUM_PATH to a Chromium executable or run `npx playwright install chromium`.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "scratchpad.spec.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: process.env.FLOWSTATE_QA_BASE_URL ?? "http://127.0.0.1:3010",
    browserName: "chromium",
    headless: true,
    launchOptions: { executablePath },
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
