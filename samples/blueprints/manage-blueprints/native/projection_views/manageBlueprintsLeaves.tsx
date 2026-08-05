import React from "react";

import { parseBlueprintJson, resolveBlueprintExecution } from "@gik/blueprint";
import {
  BlueprintHost,
  useBlueprintHostRegistry,
  useProjectionProviderResolver,
  type ProjectionView,
} from "@gik/react";

const BlueprintImport: ProjectionView = ({ emit }) => (
  <label className="gx-btn">
    Import JSON
    <input
      type="file"
      accept="application/json,.json"
      hidden
      onChange={async (event) => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        emit("import", { name: file.name, text: await file.text() });
        event.currentTarget.value = "";
      }}
    />
  </label>
);

const BlueprintPreview: ProjectionView = ({ node }) => {
  const blueprintRegistry = useBlueprintHostRegistry();
  const resolveLeavesProvider = useProjectionProviderResolver() ?? undefined;
  const source = node.props.blueprint;
  const result = React.useMemo(() => {
    try {
      return { blueprint: parseBlueprintJson(JSON.stringify(source)), error: "" };
    } catch (error) {
      return { blueprint: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [source]);

  if (result.error || !result.blueprint) {
    return <p className="gx-note gx-note-danger">{result.error || "No preview blueprint available."}</p>;
  }

  const payload = result.blueprint.payload;
  const execution = resolveBlueprintExecution(result.blueprint);
  const livePreviewable = execution.stages.length === 0
    && Object.keys(payload.cells ?? {}).length > 0
    && (payload.projections?.presentation?.roots.length ?? 0) === 1;
  return (
    <>
      <div className="gx-panel">
        <dl>
          <dt>ID</dt><dd>{payload.id}</dd>
          <dt>Kind</dt><dd>{payload.kind}</dd>
          <dt>Version</dt><dd>{payload.version}</dd>
          <dt>Structure mode</dt><dd>{payload.structureMode ?? "fixed"}</dd>
          <dt>Tiers</dt><dd>{payload.tiers.map((tier) => `${tier.id} (${tier.kind})`).join(", ")}</dd>
          <dt>Recipe chain</dt>
          <dd>{execution.stages.length > 0
            ? execution.stages.map((stage) => `${stage.fromTier.id} -[${stage.recipe.id}]-> ${stage.toTier.id}`).join("; ")
            : `Terminal: ${payload.tiers[0]?.id ?? "none"}`}</dd>
          <dt>Execution</dt>
          <dd>{execution.stages.length > 0
            ? "Lowering required: provide a dialect-owned lowering implementation."
            : "Runtime ready"}</dd>
          <dt>Cells</dt><dd>{Object.keys(payload.cells ?? {}).length}</dd>
        </dl>
      </div>
      {livePreviewable ? (
        <BlueprintPreviewBoundary key={JSON.stringify(result.blueprint)}>
          <BlueprintHost
            blueprint={result.blueprint}
            blueprintRegistry={blueprintRegistry}
            resolveLeavesProvider={resolveLeavesProvider}
            primaryInstanceId={`manage-preview:${payload.id}`}
          />
        </BlueprintPreviewBoundary>
      ) : (
        <p className="gx-note">This artifact has no directly mountable terminal presentation.</p>
      )}
    </>
  );
};

class BlueprintPreviewBoundary extends React.Component<React.PropsWithChildren, { error: string }> {
  state = { error: "" };

  static getDerivedStateFromError(error: unknown): { error: string } {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render(): React.ReactNode {
    if (this.state.error) return <p className="gx-note gx-note-danger">{this.state.error}</p>;
    return this.props.children;
  }
}

const projectionViews: Record<string, ProjectionView> = {
  "blueprint-import": BlueprintImport,
  "blueprint-preview": BlueprintPreview,
};

export default projectionViews;
