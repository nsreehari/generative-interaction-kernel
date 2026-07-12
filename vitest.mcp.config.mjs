import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["transports/mcp-http/test/**/*.test.ts"],
  },
});