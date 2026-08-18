import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/shared/index.ts",
    semantic: "src/semantic/index.ts",
    security: "src/security/index.ts",
    software: "src/software/index.ts",
    primitives: "src/primitives/index.ts",
    fluent: "src/fluent/index.ts",
    "agent-facing": "src/agent-facing/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  minify: true,
  clean: true,
  tsconfig: "tsconfig.json",
});