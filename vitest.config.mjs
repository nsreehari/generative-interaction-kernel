import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const blueprintPackage = fileURLToPath(
  new URL("./blueprint/src/index.ts", import.meta.url)
);
const blueprintWorkerPackage = fileURLToPath(
  new URL("./blueprint/src/worker.ts", import.meta.url)
);
const providerStepOrchestrator = fileURLToPath(
  new URL("./packages/provider-step-orchestrator/src/index.ts", import.meta.url)
);
const providerBlueprintAuthoring = fileURLToPath(
  new URL("./packages/provider-blueprint-authoring/src/index.ts", import.meta.url)
);

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "evaluators",
          environment: "node",
          include: ["packages/evaluators/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "kernel",
          environment: "node",
          include: ["kernel/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "blueprint",
          environment: "node",
          include: ["blueprint/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "durable-runtime",
          environment: "node",
          include: ["packages/durable-runtime/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "profile",
          environment: "node",
          include: ["profile/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "agent-lifecycle-exp",
          environment: "node",
          include: ["packages/agent-lifecycle-exp/test/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "blueprint-agent-host",
          environment: "node",
          include: ["packages/blueprint-agent-host/test/**/*.test.ts"],
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
          name: "components",
          environment: "node",
          include: ["packages/components/test/**/*.test.tsx"],
        },
      },
      {
        resolve: {
          alias: {
            "@gik/blueprint": blueprintPackage,
          },
        },
        test: {
          name: "face",
          environment: "node",
          include: ["face/test/**/*.test.ts"],
        },
      },
      {
        resolve: {
          alias: {
            "@gik/blueprint": blueprintPackage,
          },
        },
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
        resolve: {
          alias: {
            "@gik/blueprint/worker": blueprintWorkerPackage,
            "@gik/blueprint": blueprintPackage,
            "@gik/provider-step-orchestrator": providerStepOrchestrator,
            "@gik/provider-blueprint-authoring": providerBlueprintAuthoring,
          },
        },
        test: {
          name: "samples",
          environment: "node",
          testTimeout: 20_000,
          setupFiles: ["samples/tests/setup-blueprint-catalog.ts"],
          exclude: ["samples/blueprints/half-baked/**", "samples/half-baked-tests/**"],
          include: [
            "samples/apps/node-host/**/*.test.ts",
            "samples/examples/**/*.test.ts",
            "samples/tests/**/*.test.ts",
            "samples/apps/browser-host/**/*.test.ts",
            "samples/apps/browser-host/**/*.test.tsx",
            "samples/service-kinds/**/*.test.ts",
            "samples/blueprints/**/native/projection_views/**/*.test.ts",
            "samples/blueprints/**/native/projection_views/**/*.test.tsx",
            "samples/blueprints/**/native/effect_handlers/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "mcp",
          environment: "node",
          include: ["transports/mcp-http/test/**/*.test.ts"],
        },
      },
    ],
  },
});