import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./samples/apps/browser-host/parity",
  testMatch: "portfolio-tracker-new.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4177",
    browserName: "chromium",
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run blueprints:bundle --workspace=@gik/samples && npx vite samples/apps/browser-host --host 127.0.0.1 --port 4177 --strictPort",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});