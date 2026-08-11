import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import sirv from "sirv";
import { defineConfig, type Plugin } from "vite";

const hostDirectory = fileURLToPath(new URL(".", import.meta.url));
const storybookDirectory = fileURLToPath(new URL("../../storybook-static/", import.meta.url));
const catalogDirectory = fileURLToPath(new URL("../../catalog/", import.meta.url));

function hostedStorybook(): Plugin {
  return {
    name: "gik-hosted-storybook",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname !== "/storybook") {
          next();
          return;
        }

        response.statusCode = 308;
        response.setHeader("Location", `/storybook/${url.search}`);
        response.end();
      });
      server.middlewares.use(
        "/storybook",
        sirv(storybookDirectory, { dev: true, etag: true }),
      );
    },
    closeBundle() {
      if (!existsSync(storybookDirectory)) {
        throw new Error("Storybook output is missing. Run npm run build:storybook first.");
      }

      cpSync(storybookDirectory, `${hostDirectory}dist/storybook`, { recursive: true });
    },
  };
}

// The ONE generic host: a consumer of the public packages plus the sample Blueprints it mounts.
export default defineConfig({
  // For GitHub Pages the site is served under /<repo>/, so built asset URLs must be prefixed.
  // The Pages workflow sets a versioned /gik/v*/ base; local dev/build defaults to "/".
  base: process.env.VITE_BASE || "/",
  publicDir: catalogDirectory,
  plugins: [react(), hostedStorybook()],
  server: { port: 5175 },
});
