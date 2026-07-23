import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The ONE generic host: a consumer of the public packages plus the sample bundles it mounts.
export default defineConfig({
  // For GitHub Pages the site is served under /<repo>/, so built asset URLs must be prefixed.
  // The Pages workflow sets VITE_BASE=/gik/; local dev/build default to "/".
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: { port: 5175 },
});
