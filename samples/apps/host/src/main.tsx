import { createRoot } from "react-dom/client";
import { Host } from "./Host";
import { HostThemeProvider } from "./HostThemeProvider";
import { bootstrapSampleBlueprintCatalog } from "../../../shared/blueprint-catalog";
import { installSampleBlueprintCatalog } from "../../../shared/blueprints";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
// StrictMode intentionally omitted: it double-invokes effects, which would spin up nested embedded
// runtimes (preview/playground) twice.
//
// The whole host renders inside a Fluent `FluentProvider`: it supplies a standard theme
// (`webLightTheme`) as design tokens. The semantic style ROLES (--panel/--text/--accent/...) are
// derived from the shared theme/roles.json and bound to Fluent tokens by the host theme provider — so
// Fluent drives the theme instead of a hand-maintained CSS palette. Swap `webLightTheme` for
// `webDarkTheme` to re-theme everything.
async function start(rootElement: HTMLElement): Promise<void> {
  installSampleBlueprintCatalog(await bootstrapSampleBlueprintCatalog());
  createRoot(rootElement).render(
    <HostThemeProvider>
      <Host />
    </HostThemeProvider>
  );
}

void start(el);
