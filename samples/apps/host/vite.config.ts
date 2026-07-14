import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The vendored JSONata is a first-party UMD/CommonJS file (not in node_modules). Vite's *build*
// (Rolldown) applies CJS->ESM interop to it natively, but the *dev server* serves it raw and finds
// no ESM `default` export. Under Node's ESM interop the same file default-imports fine, so we give
// the dev server a tiny, isolated interop: wrap the UMD with a local CommonJS `module`/`exports`
// and re-export module.exports as the default. Scoped to `apply: "serve"` so it never double-wraps
// Rolldown's build-time CJS handling.
const jsonataCjs = fileURLToPath(
  new URL("../../../kernel/src/vendor/jsonata.cjs", import.meta.url)
).replace(/\\/g, "/");

const providerReactiveStateModel = fileURLToPath(
  new URL("../../../packages/provider-reactive-state-model/src/index.ts", import.meta.url)
);
const reactPackage = fileURLToPath(
  new URL("../../../packages/react/src/index.ts", import.meta.url)
);
const profilePackage = fileURLToPath(
  new URL("../../../profile/src/index.ts", import.meta.url)
);
const providerConsequenceGraph = fileURLToPath(
  new URL("../../../packages/provider-consequence-graph/src/index.ts", import.meta.url)
);
const providerExploratoryGraph = fileURLToPath(
  new URL("../../../packages/provider-exploratory-graph/src/index.ts", import.meta.url)
);
const providerStepOrchestrator = fileURLToPath(
  new URL("../../../packages/provider-step-orchestrator/src/index.ts", import.meta.url)
);
const providerProfileAuthoring = fileURLToPath(
  new URL("../../../packages/provider-profile-authoring/src/index.ts", import.meta.url)
);

function jsonataUmdInterop(): Plugin {
  return {
    name: "jsonata-umd-esm-interop",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      if (id.replace(/\\/g, "/").split("?")[0] !== jsonataCjs) return null;
      return {
        code: `const module = { exports: {} };\nconst exports = module.exports;\n${code}\nexport default module.exports;\n`,
        map: null,
      };
    },
  };
}

// The ONE generic host: a consumer of the platform that imports only the public barrels
// (kernel/src, adapters/react/src) plus the bundles it mounts (samples/bundles/*). It runs any
// bundle by id; there is no per-app shell.
export default defineConfig({
  // For GitHub Pages the site is served under /<repo>/, so built asset URLs must be prefixed.
  // The Pages workflow sets VITE_BASE=/generative-interaction-kernel/; local dev/build default to "/".
  base: process.env.VITE_BASE || "/",
  plugins: [jsonataUmdInterop(), react()],
  resolve: {
    alias: {
      "@gik/react": reactPackage,
      "@gik/profile": profilePackage,
      "@gik/provider-reactive-state-model": providerReactiveStateModel,
      "@gik/provider-consequence-graph": providerConsequenceGraph,
      "@gik/provider-exploratory-graph": providerExploratoryGraph,
      "@gik/provider-step-orchestrator": providerStepOrchestrator,
      "@gik/provider-profile-authoring": providerProfileAuthoring,
    },
  },
  server: { port: 5175 },
});
