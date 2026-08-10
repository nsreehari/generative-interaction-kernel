import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./samples/apps/browser-host/parity",
  snapshotPathTemplate: "{testDir}/fixtures/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000, toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.01 } },
  use: {
    baseURL: "http://127.0.0.1:4176",
    browserName: "chromium",
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:host -- --host 127.0.0.1 --port 4176 --strictPort",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
