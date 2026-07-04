import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The vendored JSONata is a first-party UMD/CommonJS file (not in node_modules). Vite's *build*
// (Rolldown) applies CJS->ESM interop to it natively, but the *dev server* serves it raw and finds
// no ESM `default` export. Under Node's ESM interop the same file default-imports fine, so rather
// than change the shared kernel we give the dev server a tiny, isolated interop: wrap the UMD with
// a local CommonJS `module`/`exports` and re-export module.exports as the default. Scoped to
// `apply: "serve"` so it never double-wraps Rolldown's build-time CJS handling. Only affects the
// workbench; the library and its Node tests are untouched.
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

// The workbench is a *consumer* of the platform: it imports only the public barrels
// (interaction/src, adapters/react/src, kernel/src) plus its own demo data. Vite compiles those
// TS sources directly, so no platform build/publish step is needed yet.
export default defineConfig({
  plugins: [jsonataUmdInterop(), react()],
  server: { port: 5174 },
});
