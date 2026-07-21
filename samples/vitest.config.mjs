import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "control-host/**/*.test.ts",
      "shared/**/*.test.ts",
      "profiles/**/*.test.ts",
      "apps/host/**/*.test.ts",
      "bundles/**/*.test.ts",
    ],
  },
});
