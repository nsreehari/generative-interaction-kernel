import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "face",
      environment: "node",
      include: ["face/test/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "mcp",
      environment: "node",
      include: ["transports/mcp-http/test/**/*.test.ts"],
    },
  },
]);