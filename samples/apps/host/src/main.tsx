import { createRoot } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { Host } from "./Host";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
// StrictMode intentionally omitted: it double-invokes effects, which would spin up nested embedded
// runtimes (preview/playground) twice. Matches the prior console/workbench hosts.
//
// The whole host renders inside a Fluent `FluentProvider`: it supplies a standard theme
// (`webLightTheme`) as design tokens, and the primitive stylesheet reads those tokens (see the
// `.gx-host` palette in styles.css). Swap `webLightTheme` for `webDarkTheme` to re-theme everything.
createRoot(el).render(
  <FluentProvider theme={webLightTheme} className="gx-host">
    <Host />
  </FluentProvider>
);
