import { createRoot } from "react-dom/client";
import { FluentProvider, webLightTheme, tokens } from "@fluentui/react-components";
import { roleVars } from "@gik/react";
import { Host } from "./Host";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
// StrictMode intentionally omitted: it double-invokes effects, which would spin up nested embedded
// runtimes (preview/playground) twice. Matches the prior console/workbench hosts.
//
// The whole host renders inside a Fluent `FluentProvider`: it supplies a standard theme
// (`webLightTheme`) as design tokens. The semantic style ROLES (--panel/--text/--accent/...) are
// derived from the shared theme/roles.json and bound to Fluent tokens by `roleVars(tokens)` — so
// Fluent drives the theme instead of a hand-maintained CSS palette. Swap `webLightTheme` for
// `webDarkTheme` to re-theme everything.
createRoot(el).render(
  <FluentProvider theme={webLightTheme} className="gx-host" style={roleVars(tokens)}>
    <Host />
  </FluentProvider>
);
