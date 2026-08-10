import { createRoot } from "react-dom/client";
import { Host } from "./Host";
import { HostThemeProvider } from "./HostThemeProvider";
import {
  bootstrapSampleBlueprintCatalog,
  installSampleBlueprintCatalog,
} from "../../../shared/blueprint-catalog";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
// StrictMode intentionally omitted: it double-invokes effects, which would spin up nested embedded
// runtimes (preview/playground) twice.
//
// The whole host renders inside a Fluent `FluentProvider`: it supplies a standard theme
// (`webLightTheme`) as design tokens. Host-specific CSS variables are bound to those tokens by the
// host theme provider. Swap `webLightTheme` for `webDarkTheme` to re-theme everything.
async function start(rootElement: HTMLElement): Promise<void> {
  installSampleBlueprintCatalog(await bootstrapSampleBlueprintCatalog());
  createRoot(rootElement).render(
    <HostThemeProvider>
      <Host />
    </HostThemeProvider>
  );
}

void start(el);
