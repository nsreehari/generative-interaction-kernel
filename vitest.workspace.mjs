import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "kernel",
      environment: "node",
      include: ["kernel/test/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "react",
      environment: "node",
      include: ["adapters/react/test/**/*.test.tsx"],
    },
  },
  {
    test: {
      name: "interaction",
      environment: "node",
      include: ["interaction/test/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "face",
      environment: "node",
      include: ["face/test/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "providers",
      environment: "node",
      include: ["providers/**/test/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "sse",
      environment: "node",
      include: ["transports/http-sse/test/**/*.test.ts"],
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