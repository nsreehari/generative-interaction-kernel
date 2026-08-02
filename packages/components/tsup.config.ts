import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/shared/index.ts",
    semantic: "src/semantic/index.ts",
    primitives: "src/primitives/index.ts",
    fluent: "src/fluent/index.ts",
  },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  minify: true,
  clean: true,
  tsconfig: "tsconfig.json",
});