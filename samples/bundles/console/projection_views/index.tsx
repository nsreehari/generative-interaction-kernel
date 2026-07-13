import React from "react";
import { Handle } from "@xyflow/react";
import { InfiniteCanvas, type InfiniteCanvasNodeDescriptor } from "@gik/component-infinite-canvas";
import { loadProfileBundle, parseProfileBundleJson } from "@gik/profile";
import { readProps, type ProjectionView, type ProjectionViewProps } from "@gik/react";
import {
  traceProfile,
  type InteractionKind,
  type InteractionSpec,
  type PresentationContext,
  type ProfileStageTrace,
} from "@gik/profile-genui";
import { resolveProfileTemplate, resolveProfileTemplateResource } from "../../../profiles/template-resolver";

function ProfilePipelineCanvas({ node, emit }: ProjectionViewProps) {
  const p = readProps(node);
  const nodes = p.list<Record<string, unknown>>("nodes");
  const selectedNodeId = p.str("selectedNodeId");
  const selectedEdgeId = p.str("selectedEdgeId");
  const hasEdgeSelection = selectedEdgeId.length > 0;
  const stateKey = p.str(
    "stateKey",
    `${nodes.map((entry) => String(entry.id ?? "")).join("|")}`
  );

  if (nodes.length === 0) return <p className="gx-muted">No layers.</p>;

  const nodeById = new Map(nodes.map((entry) => [String(entry.id ?? ""), entry]));

  const descriptors: InfiniteCanvasNodeDescriptor[] = nodes.map((entry) => ({
    id: String(entry.id ?? ""),
    label: String(entry.label ?? entry.id ?? ""),
    subtitle: String(entry.subtitle ?? entry.kind ?? ""),
    meta: String(entry.meta ?? entry.schema ?? ""),
    description: String(entry.description ?? ""),
    selected: String(entry.id ?? "") === selectedNodeId,
    width: typeof entry.width === "number" ? entry.width : 220,
    draggable: false,
  }));

  const nodePorts = Object.fromEntries(
    descriptors.map((descriptor) => {
      const node = nodeById.get(descriptor.id) ?? {};
      const incomingDefs = Array.isArray(node.requires) ? node.requires : [];
      const outgoingDefs = Array.isArray(node.provides) ? node.provides : [];
      const incoming = incomingDefs.map((edge) => {
        const token = String((edge as Record<string, unknown>).token ?? (edge as Record<string, unknown>).id ?? "");
        const isSelected = token === selectedEdgeId;
        return {
          id: token ? `require:${token}` : `${descriptor.id}-in`,
          token,
          title: String((edge as Record<string, unknown>).label ?? token ?? "Incoming recipe"),
          selected: isSelected,
          highlighted: isSelected,
          dimmed: hasEdgeSelection && !isSelected,
        };
      });
      const outgoing = outgoingDefs.map((edge) => {
        const token = String((edge as Record<string, unknown>).token ?? (edge as Record<string, unknown>).id ?? "");
        const isSelected = token === selectedEdgeId;
        return {
          id: token ? `provide:${token}` : `${descriptor.id}-out`,
          token,
          title: String((edge as Record<string, unknown>).label ?? token ?? "Outgoing recipe"),
          selected: isSelected,
          highlighted: isSelected,
          dimmed: hasEdgeSelection && !isSelected,
        };
      });

      return [
        descriptor.id,
        incoming.length || outgoing.length
          ? {
              left: incoming.length ? incoming : undefined,
              right: outgoing.length ? outgoing : undefined,
            }
          : null,
      ];
    })
  );

  return (
    <div className="gx-flow-canvas-shell">
      <InfiniteCanvas
        stateKey={stateKey}
        nodes={descriptors}
        nodePorts={nodePorts}
        getInitialNodePos={(_, context) => ({ x: context.index * 280, y: 88 })}
        renderNode={(descriptor) => (
          <div className={`gx-flow-node${descriptor.selected ? " selected" : ""}`}>
            <span className="gx-flow-node-title">{String(descriptor.label ?? descriptor.id)}</span>
            {descriptor.subtitle ? <span className="gx-flow-node-subtitle">{String(descriptor.subtitle)}</span> : null}
            {descriptor.meta ? <span className="gx-flow-node-meta">{String(descriptor.meta)}</span> : null}
          </div>
        )}
        renderNodePort={(port, context) => {
          const portId = String(port.id ?? `${context.side}-port`);
          const isSource = context.side === "right" || context.side === "bottom";
          const isSelected = port.selected === true;
          const title = String(port.title ?? port.label ?? portId);
          return (
            <div className={`gx-flow-node-port gx-flow-node-port-${context.side}${isSelected ? " selected" : ""}`} title={title}>
              <Handle
                id={portId}
                type={isSource ? "source" : "target"}
                position={context.position}
                className="gx-flow-node-handle"
                isConnectable={false}
              />
              <span className="gx-flow-node-port-dot" aria-hidden="true" />
              {port.label ? <span className="gx-flow-node-port-label">{String(port.label)}</span> : null}
            </div>
          );
        }}
        onNodeClick={(id) => emit("selectNode", { id, tab: "layers" })}
        onEdgeClick={(id) => emit("selectEdge", { id, tab: "layers" })}
        controls={false}
        miniMap={false}
        background={false}
        panOnScroll={false}
        selectionOnDrag={false}
        minZoom={0.7}
        maxZoom={1.2}
        fitViewOptions={{ padding: 0.12 }}
        className="gx-flow-canvas"
        viewportClassName="gx-flow-canvas-viewport"
      />
    </div>
  );
}

// Rebuild a runnable profile from the selected bundle's JSON text (console.artifacts.bundleText).
// Mirrors the store's proven load path (parse -> loadProfileBundle) so the leaves can run the SAME
// engine (traceProfile) the store uses, but live and driven by in-component selections.
function reconstructProfile(bundleText: string) {
  return loadProfileBundle(
    parseProfileBundleJson(bundleText),
    resolveProfileTemplateResource,
    resolveProfileTemplate
  );
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

// Preview tab: run the WHOLE profile for the current inputs and show every stage's output as a
// vertical waterfall — the literal "watch it lower" view. Read-only compute; the final rendered
// document is still mounted separately via ui:embed.
function PipelineRunner({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const bundleText = p.str("bundleText");
  const interaction = p.str("interaction", "investigate");
  const subject = p.str("subject", "incident");
  const surface = p.str("surface", "desktop");
  const data = p.obj<Record<string, string>>("data", {});

  const result = React.useMemo(() => {
    if (!bundleText.trim()) return { stages: [] as ProfileStageTrace[], spec: null as InteractionSpec | null, error: "" };
    try {
      const profile = reconstructProfile(bundleText);
      const spec: InteractionSpec = {
        interaction: interaction as InteractionKind,
        subject: subject.trim() || "incident",
        ...(Object.keys(data).length > 0 ? { data } : {}),
      };
      const stages = traceProfile(profile, spec, { surface: String(surface) });
      return { stages, spec, error: "" };
    } catch (err) {
      return { stages: [] as ProfileStageTrace[], spec: null as InteractionSpec | null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [bundleText, interaction, subject, surface, JSON.stringify(data)]);

  if (!bundleText.trim()) return <p className="gx-muted">Select a profile to trace its lowering.</p>;
  if (result.error) return <p className="gx-json-error">{result.error}</p>;

  return (
    <div className="gx-col">
      <div className="gx-panel-inset">
        <span className="gx-property-label">Input · interaction goal</span>
        <div className="gx-code">
          <pre>{prettyJson(result.spec)}</pre>
        </div>
      </div>
      {result.stages.map((stage, index) => (
        <div key={`${stage.fromLayerId}->${stage.toLayerId}`} className="gx-panel-inset">
          <span className="gx-property-label">
            Stage {index + 1} · {stage.fromKind} → {stage.toKind}
          </span>
          <div className="gx-code">
            <pre>{prettyJson(stage.output)}</pre>
          </div>
        </div>
      ))}
    </div>
  );
}

// Layers tab: pick one interaction goal (the profile's real external inputs) and run the profile,
// showing what the SELECTED layer lowers into for that seed — the interactive replacement for the
// old static worked-examples table. Terminal layers (no outgoing stage) report so.
function LoweringRecipeRunner({ node }: ProjectionViewProps) {
  const p = readProps(node);
  const bundleText = p.str("bundleText");
  const layerId = p.str("layerId");
  const subject = p.str("subject", "incident");
  const surface = p.str("surface", "desktop");
  const seeds = p.list<string>("seeds");
  const [picked, setPicked] = React.useState("");
  const activeSeed = picked && seeds.includes(picked) ? picked : seeds[0] ?? "";

  const result = React.useMemo(() => {
    if (!bundleText.trim() || !layerId || !activeSeed) return null;
    try {
      const profile = reconstructProfile(bundleText);
      const trace = traceProfile(
        profile,
        { interaction: activeSeed as InteractionKind, subject: subject.trim() || "incident" },
        { surface: String(surface) },
      );
      const step = trace.find((candidate) => candidate.fromLayerId === layerId);
      if (!step) return { error: "This layer is terminal for that goal — nothing lowers out of it." };
      return { error: "", fromKind: step.fromKind, toKind: step.toKind, input: step.input, output: step.output };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [bundleText, layerId, activeSeed, subject, surface]);

  if (!bundleText.trim() || !layerId) return <p className="gx-muted">Select a layer to compute its lowering.</p>;
  if (seeds.length === 0) return <p className="gx-muted">This profile has no interaction goals to run.</p>;

  return (
    <div className="gx-col">
      <div className="gx-row">
        {seeds.map((seed) => (
          <button
            key={seed}
            type="button"
            className={`gx-btn${seed === activeSeed ? " gx-btn-primary" : ""}`}
            onClick={() => setPicked(seed)}
          >
            {seed}
          </button>
        ))}
      </div>
      {result?.error ? (
        <p className="gx-json-error">{result.error}</p>
      ) : result ? (
        <div className="gx-col">
          <div className="gx-panel-inset">
            <span className="gx-property-label">Input · {result.fromKind}</span>
            <div className="gx-code">
              <pre>{prettyJson(result.input)}</pre>
            </div>
          </div>
          <div className="gx-panel-inset">
            <span className="gx-property-label">Output · {result.toKind}</span>
            <div className="gx-code">
              <pre>{prettyJson(result.output)}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const projectionViews: Record<string, ProjectionView> = {
  "profile-pipeline-canvas": ProfilePipelineCanvas,
  "pipeline-runner": PipelineRunner,
  "lowering-recipe-runner": LoweringRecipeRunner,
};

export default projectionViews;
