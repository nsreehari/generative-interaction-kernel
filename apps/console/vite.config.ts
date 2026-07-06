import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// See apps/workbench/vite.config.ts for the full rationale: the vendored JSONata is a first-party
// UMD/CJS file that the dev server serves raw (no ESM default export). This serve-only plugin wraps
// it with a local CommonJS module/exports and re-exports the default, matching Node's ESM interop.
// The build (Rolldown) handles CJS natively, so this is scoped to `apply: "serve"`.
const jsonataCjs = fileURLToPath(new URL("../../kernel/src/vendor/jsonata.cjs", import.meta.url)).replace(/\\/g, "/");

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

// The console is another *consumer* of the platform: it imports only the public barrels
// (kernel/src, adapters/react/src) plus its own profile sources. Runs on its own port so it can
// live alongside the workbench.
export default defineConfig({
  plugins: [jsonataUmdInterop(), react()],
  server: { port: 5175 },
});
