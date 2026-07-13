import React from "react";
import { Handle } from "@xyflow/react";
import { InfiniteCanvas, type InfiniteCanvasNodeDescriptor } from "@gik/component-infinite-canvas";
import { readProps, type ProjectionView, type ProjectionViewProps } from "@gik/react";

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
          label: String((edge as Record<string, unknown>).label ?? token ?? "In"),
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
          label: String((edge as Record<string, unknown>).label ?? token ?? "Out"),
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
          return (
            <div className={`gx-flow-node-port gx-flow-node-port-${context.side}${isSelected ? " selected" : ""}`} title={String(port.label ?? portId)}>
              <Handle
                id={portId}
                type={isSource ? "source" : "target"}
                position={context.position}
                className="gx-flow-node-handle"
                isConnectable={false}
              />
              <span className="gx-flow-node-port-dot" aria-hidden="true" />
              <span className="gx-flow-node-port-label">{String(port.label ?? portId)}</span>
            </div>
          );
        }}
        onNodeClick={(id) => emit("selectNode", { id, tab: "layers" })}
        onEdgeClick={(id) => emit("selectEdge", { id, tab: "recipes" })}
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

const projectionViews: Record<string, ProjectionView> = {
  "profile-pipeline-canvas": ProfilePipelineCanvas,
};

export default projectionViews;
