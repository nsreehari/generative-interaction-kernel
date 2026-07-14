import { fileURLToPath } from "node:url";
import { defineWorkspace } from "vitest/config";

const providerReactiveStateModel = fileURLToPath(
  new URL("./packages/provider-reactive-state-model/src/index.ts", import.meta.url)
);
const profilePackage = fileURLToPath(
  new URL("./profile/src/index.ts", import.meta.url)
);
const providerConsequenceGraph = fileURLToPath(
  new URL("./packages/provider-consequence-graph/src/index.ts", import.meta.url)
);
const providerExploratoryGraph = fileURLToPath(
  new URL("./packages/provider-exploratory-graph/src/index.ts", import.meta.url)
);
const providerStepOrchestrator = fileURLToPath(
  new URL("./packages/provider-step-orchestrator/src/index.ts", import.meta.url)
);
const providerProfileAuthoring = fileURLToPath(
  new URL("./packages/provider-profile-authoring/src/index.ts", import.meta.url)
);

export default defineWorkspace([
  {
    test: {
      name: "shared",
      environment: "node",
      include: ["shared/libs/test/**/*.test.ts"],
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
      name: "react",
      environment: "node",
      include: ["adapters/react/test/**/*.test.tsx"],
    },
  },
  {
    resolve: {
      alias: {
        "@gik/profile": profilePackage,
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
        "@gik/profile": profilePackage,
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
        "@gik/profile": profilePackage,
        "@gik/provider-reactive-state-model": providerReactiveStateModel,
        "@gik/provider-consequence-graph": providerConsequenceGraph,
        "@gik/provider-exploratory-graph": providerExploratoryGraph,
        "@gik/provider-step-orchestrator": providerStepOrchestrator,
        "@gik/provider-profile-authoring": providerProfileAuthoring,
      },
    },
    test: {
      name: "samples",
      environment: "node",
      include: [
        "samples/control-host/**/*.test.ts",
        "samples/profiles/**/*.test.ts",
        "samples/apps/host/**/*.test.ts",
        "samples/bundles/**/*.test.ts",
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
]);