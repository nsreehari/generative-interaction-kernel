import React from "react";

import { parseBlueprintJson, parseBlueprintReference, resolveBlueprintExecution } from "@gik/blueprint";
import {
  BlueprintHost,
  useBlueprintHostRegistry,
  useProjectionProviderResolver,
  type ProjectionView,
  type ReactBlueprintHostRegistry,
} from "@gik/react";

const BlueprintCatalogLoader: ProjectionView = ({ emit }) => {
  const emitRef = React.useRef(emit);
  React.useEffect(() => {
    emitRef.current("load", {});
  }, []);
  return null;
};

const BlueprintPreview: ProjectionView = ({ node }) => {
  const blueprintRegistry = useBlueprintHostRegistry();
  const resolveLeavesProvider = useProjectionProviderResolver() ?? undefined;
  const source = node.props.blueprint;
  const reference = typeof node.props.reference === "string" ? node.props.reference : "";
  const [resolution, setResolution] = React.useState<Awaited<ReturnType<ReactBlueprintHostRegistry["resolve"]>> | null>(null);
  const [resolutionError, setResolutionError] = React.useState("");
  const result = React.useMemo(() => {
    try {
      return { blueprint: parseBlueprintJson(JSON.stringify(source)), error: "" };
    } catch (error) {
      return { blueprint: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [source]);

  React.useEffect(() => {
    let active = true;
    setResolution(null);
    setResolutionError("");
    if (!reference) return () => { active = false; };
    if (!blueprintRegistry) {
      setResolutionError(`No Blueprint registry can resolve '${reference}'.`);
      return () => { active = false; };
    }
    void Promise.resolve(blueprintRegistry.resolve(parseBlueprintReference(reference), {
      parentBlueprintId: "manage-blueprints",
      parentInstanceId: "manage-blueprints:preview",
      cellId: "portable-blueprint-preview",
    })).then(
      (next) => { if (active) setResolution(next); },
      (error: unknown) => { if (active) setResolutionError(error instanceof Error ? error.message : String(error)); },
    );
    return () => { active = false; };
  }, [blueprintRegistry, reference]);

  if (result.error || resolutionError || !result.blueprint) {
    return <p className="gx-note gx-note-danger">{result.error || resolutionError || "No preview Blueprint available."}</p>;
  }

  const payload = result.blueprint.payload;
  const execution = resolveBlueprintExecution(result.blueprint);
  const livePreviewable = execution.service.stages.length === 0
    && execution.projection.stages.length === 0
    && Object.keys(payload.cells ?? {}).length > 0
    && (payload.projections?.presentation?.roots.length ?? 0) === 1;
  if (reference && !resolution) return <p className="gx-note">Loading Blueprint preview...</p>;
  if (!livePreviewable) return <p className="gx-note">This Blueprint has no directly renderable presentation.</p>;
  return (
    <div className="gx-blueprint-preview">
      <BlueprintPreviewBoundary key={JSON.stringify(result.blueprint)}>
        <BlueprintHost
          blueprint={resolution?.blueprint ?? result.blueprint}
          native={resolution?.native}
          blueprintRegistry={blueprintRegistry}
          resolveLeavesProvider={resolveLeavesProvider}
          primaryInstanceId={`manage-preview:${payload.id}`}
        />
      </BlueprintPreviewBoundary>
    </div>
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
  "catalog-loader": BlueprintCatalogLoader,
  "blueprint-preview": BlueprintPreview,
};

export default projectionViews;
