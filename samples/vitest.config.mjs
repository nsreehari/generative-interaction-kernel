import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "apps/node-host/**/*.test.ts",
      "examples/**/*.test.ts",
      "profiles/**/*.test.ts",
      "apps/browser-host/**/*.test.ts",
      "bundles/**/*.test.ts",
    ],
  },
});
