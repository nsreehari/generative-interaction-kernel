import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/base.css";
import { Spinner } from "@fluentui/react-components";
import { HostThemeProvider } from "./HostThemeProvider";

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
// StrictMode intentionally omitted: it double-invokes effects, which would spin up nested embedded
// runtimes (preview/playground) twice.
//
// The whole host renders inside a Fluent `FluentProvider`: it supplies a standard theme
// (`webLightTheme`) as design tokens. Host-specific CSS variables are bound to those tokens by the
// host theme provider. Swap `webLightTheme` for `webDarkTheme` to re-theme everything.

function loadingShell(): ReactElement {
  return <Spinner label={"Loading\u00a0\u2026"} labelPosition="after" size="small" />;
}

// `./Host` and the sample Blueprint catalog module both transitively import the full render/runtime
// stack (kernel, blueprint compiler, durable-runtime, demo-runner-host, ...). Importing them
// statically here would block the very first paint on fetching/parsing/evaluating that entire graph.
// Loading them dynamically lets the browser paint a shell immediately, while both loads proceed in
// parallel with each other and with the catalog bootstrap fetch.
async function start(rootElement: HTMLElement): Promise<void> {
  const root = createRoot(rootElement);
  root.render(<HostThemeProvider>{loadingShell()}</HostThemeProvider>);

  const [catalogModule, hostModule] = await Promise.all([
    import("../../../catalog/blueprint-catalog"),
    import("./Host"),
  ]);
  catalogModule.installSampleBlueprintCatalog(await catalogModule.bootstrapSampleBlueprintCatalog());

  const { Host } = hostModule;
  root.render(
    <HostThemeProvider>
      <Host />
    </HostThemeProvider>
  );
}

void start(el);
