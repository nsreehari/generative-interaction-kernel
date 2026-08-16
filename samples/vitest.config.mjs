import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup-blueprint-catalog.ts"],
    include: [
      "tests/**/*.test.ts",
      "apps/node-host/**/*.test.ts",
      "examples/**/*.test.ts",
      "profiles/**/*.test.ts",
      "apps/browser-host/**/*.test.ts",
      "apps/browser-host/**/*.test.tsx",
      "service-kinds/**/*.test.ts",
      "bundles/**/*.test.ts",
    ],
  },
});
