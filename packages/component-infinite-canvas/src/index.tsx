import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Background,
  Controls,
  getBezierPath,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  useUpdateNodeInternals,
  type Edge,
  type FitViewOptions,
  type Node,
  type ProOptions,
  type ReactFlowInstance,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";

const CANVAS_FRAME_TYPE = "__canvasFrame";

const SIDE_POSITION = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
} as const;

const DEFAULT_BACKGROUND = { gap: 24, size: 1.1, color: "var(--line)" };
const DEFAULT_PRO_OPTIONS: ProOptions = { hideAttribution: true };

type Side = keyof typeof SIDE_POSITION;

interface DerivedEdgeState {
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  running: boolean;
}

interface DerivedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  sourceSide: Side;
  targetSide: Side;
  sourceIndex: number;
  targetIndex: number;
  sourceCount: number;
  targetCount: number;
  label?: string;
  state: DerivedEdgeState;
}

export interface InfiniteCanvasPort {
  id?: string;
  token?: string;
  [key: string]: unknown;
}

export interface InfiniteCanvasPorts {
  top?: InfiniteCanvasPort[];
  bottom?: InfiniteCanvasPort[];
  left?: InfiniteCanvasPort[];
  right?: InfiniteCanvasPort[];
}

export type InfiniteCanvasPortMap =
  | Map<string, InfiniteCanvasPorts | null>
  | Record<string, InfiniteCanvasPorts | null | undefined>;

export interface InfiniteCanvasNodeDescriptor extends Record<string, unknown> {
  id: string;
  width?: number;
  draggable?: boolean;
}

export interface InfiniteCanvasRef {
  fitView: (opts?: FitViewOptions) => void;
  setViewport: (viewport: Viewport, opts?: { duration?: number }) => void;
  setCenter: (x: number, y: number, opts?: { zoom?: number; duration?: number }) => void;
  getViewport: () => Viewport | undefined;
  getNode: (id: string) => Node | undefined;
  instance: unknown;
}

interface InternalNodeData extends Record<string, unknown> {
  __node: InfiniteCanvasNodeDescriptor;
  __ports: InfiniteCanvasPorts | null;
  __renderNode?: (node: InfiniteCanvasNodeDescriptor) => React.ReactNode;
  __renderNodePort?: (port: InfiniteCanvasPort, context: {
    side: Side;
    position: Position;
    node: InfiniteCanvasNodeDescriptor;
  }) => React.ReactNode;
}

export interface InfiniteCanvasProps {
  stateKey: string;
  canvasState?: {
    v?: number;
    viewport?: Viewport | null;
    nodes?: Record<string, { x: number; y: number }>;
  } | null;
  onCanvasStateCommit?: (blob: {
    v: number;
    viewport: Viewport | null;
    nodes: Record<string, { x: number; y: number }>;
  }) => void;
  getInitialNodePos?: (
    descriptor: InfiniteCanvasNodeDescriptor,
    context: {
      index: number;
      nodeCount: number;
      nodes: InfiniteCanvasNodeDescriptor[];
      placed: Record<string, XYPosition>;
    }
  ) => XYPosition | null | undefined;
  nodes?: InfiniteCanvasNodeDescriptor[];
  nodePorts?: InfiniteCanvasPortMap;
  renderNode?: (node: InfiniteCanvasNodeDescriptor) => React.ReactNode;
  renderNodePort?: (port: InfiniteCanvasPort, context: {
    side: Side;
    position: Position;
    node: InfiniteCanvasNodeDescriptor;
  }) => React.ReactNode;
  minZoom?: number;
  maxZoom?: number;
  fitViewOptions?: FitViewOptions;
  miniMap?: boolean | Record<string, unknown>;
  controls?: boolean | Record<string, unknown>;
  background?: false | Record<string, unknown>;
  overlay?: React.ReactNode;
  panOnScroll?: boolean;
  selectionOnDrag?: boolean;
  proOptions?: ProOptions;
  className?: string;
  viewportClassName?: string;
  onViewportChange?: (viewport: Viewport | null) => void;
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edgeId: string) => void;
}

function deepEqualView(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "function" && typeof b === "function") return true;
  if (typeof a !== typeof b) return false;
  if (!a || !b || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqualView((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}

const CanvasFrameNode = memo(function CanvasFrameNode({ data }: { data: InternalNodeData }) {
  const node = data.__node;
  const ports = data.__ports;
  const renderNode = data.__renderNode;
  const renderNodePort = data.__renderNodePort;
  const updateNodeInternals = useUpdateNodeInternals();
  const body = renderNode ? renderNode(node) : null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => updateNodeInternals(node.id));
    return () => window.cancelAnimationFrame(frame);
  }, [node.id, ports, updateNodeInternals]);

  const renderRail = (side: Side) => {
    const list = ports?.[side];
    if (!Array.isArray(list) || list.length === 0) return null;
    const position = SIDE_POSITION[side];
    return (
      <div className={`infinite-canvas-node__rail infinite-canvas-node__rail--${side}`}>
        {list.map((port, index) => (
          <React.Fragment key={port?.id ?? `${side}:${index}`}>
            {renderNodePort ? renderNodePort(port, { side, position, node }) : null}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const hasLeft = Array.isArray(ports?.left) && ports.left.length > 0;
  const hasRight = Array.isArray(ports?.right) && ports.right.length > 0;

  return (
    <div className="infinite-canvas-node">
      {renderRail("top")}
      {hasLeft || hasRight ? (
        <div className="infinite-canvas-node__row">
          {renderRail("left")}
          <div className="infinite-canvas-node__body">{body}</div>
          {renderRail("right")}
        </div>
      ) : (
        <div className="infinite-canvas-node__body">{body}</div>
      )}
      {renderRail("bottom")}
    </div>
  );
});

const NODE_TYPES = { [CANVAS_FRAME_TYPE]: CanvasFrameNode };

function normalizeBlob(blob: InfiniteCanvasProps["canvasState"]) {
  return {
    v: 1,
    viewport: blob?.viewport ?? null,
    nodes: blob?.nodes && typeof blob.nodes === "object" ? blob.nodes : {},
  };
}

function readPorts(nodePorts: InfiniteCanvasPortMap | undefined, id: string): InfiniteCanvasPorts | null {
  if (!nodePorts) return null;
  if (nodePorts instanceof Map) return nodePorts.get(id) ?? null;
  return nodePorts[id] ?? null;
}

function resolvePortsForDescriptor(
  descriptor: InfiniteCanvasNodeDescriptor,
  nodePorts: InfiniteCanvasPortMap | undefined,
): InfiniteCanvasPorts | null {
  return readPorts(nodePorts, descriptor.id);
}

function readPortToken(port: InfiniteCanvasPort): string {
  if (typeof port.token === "string" && port.token.trim()) {
    return port.token.trim();
  }
  if (typeof port.id === "string" && port.id.trim()) {
    return port.id.trim();
  }
  return "";
}

function readOpaqueBoolean(port: InfiniteCanvasPort, key: string): boolean {
  return port[key] === true;
}

function mergeEdgeState(sourcePort: InfiniteCanvasPort, targetPort: InfiniteCanvasPort): DerivedEdgeState {
  const selected = readOpaqueBoolean(sourcePort, "selected") || readOpaqueBoolean(targetPort, "selected");
  return {
    selected,
    highlighted: readOpaqueBoolean(sourcePort, "highlighted") || readOpaqueBoolean(targetPort, "highlighted") || selected,
    dimmed: readOpaqueBoolean(sourcePort, "dimmed") || readOpaqueBoolean(targetPort, "dimmed"),
    running: readOpaqueBoolean(sourcePort, "running") || readOpaqueBoolean(targetPort, "running") || readOpaqueBoolean(sourcePort, "animated") || readOpaqueBoolean(targetPort, "animated"),
  };
}

function readEdgeLabel(sourcePort: InfiniteCanvasPort, targetPort: InfiniteCanvasPort): string | undefined {
  if (typeof sourcePort.label === "string" && sourcePort.label.trim()) {
    return sourcePort.label;
  }
  if (typeof targetPort.label === "string" && targetPort.label.trim()) {
    return targetPort.label;
  }
  return undefined;
}

function resolveLeaderCurve(sourceX: number, sourceY: number, targetX: number, targetY: number, state: DerivedEdgeState): number {
  const horizontalDistance = Math.abs(targetX - sourceX);
  const verticalDistance = Math.abs(targetY - sourceY);

  if (horizontalDistance < 180 && verticalDistance < 120) {
    return 0.26;
  }

  if (horizontalDistance > 520 || verticalDistance > 320) {
    return state.highlighted || state.running ? 0.68 : 0.58;
  }

  return state.highlighted || state.running ? 0.58 : 0.46;
}

function deriveEdgesFromNodePorts(
  nodeDescriptors: InfiniteCanvasNodeDescriptor[],
  nodePorts: InfiniteCanvasPortMap | undefined,
): DerivedEdge[] {
  const targetPortsByToken = new Map<string, Array<{
    nodeId: string;
    port: InfiniteCanvasPort;
    side: Side;
    index: number;
    count: number;
  }>>();

  for (const descriptor of nodeDescriptors) {
    const ports = resolvePortsForDescriptor(descriptor, nodePorts);
    for (const side of ["left", "top"] as const) {
      const rail = ports?.[side];
      if (!Array.isArray(rail)) continue;
      for (const [index, port] of rail.entries()) {
        const token = readPortToken(port);
        if (!token) continue;
        const list = targetPortsByToken.get(token) ?? [];
        list.push({ nodeId: descriptor.id, port, side, index, count: rail.length });
        targetPortsByToken.set(token, list);
      }
    }
  }

  const edges: DerivedEdge[] = [];
  for (const descriptor of nodeDescriptors) {
    const ports = resolvePortsForDescriptor(descriptor, nodePorts);
    for (const side of ["right", "bottom"] as const) {
      const rail = ports?.[side];
      if (!Array.isArray(rail)) continue;
      for (const [index, sourcePort] of rail.entries()) {
        const token = readPortToken(sourcePort);
        const sourcePortId = typeof sourcePort.id === "string" ? sourcePort.id : "";
        if (!token || !sourcePortId) continue;
        const targets = targetPortsByToken.get(token) ?? [];
        for (const { nodeId: targetNodeId, port: targetPort, side: targetSide, index: targetIndex, count: targetCount } of targets) {
          const targetPortId = typeof targetPort.id === "string" ? targetPort.id : "";
          if (!targetPortId || descriptor.id === targetNodeId) continue;
          edges.push({
            id: token,
            source: descriptor.id,
            target: targetNodeId,
            sourceHandle: sourcePortId,
            targetHandle: targetPortId,
            sourceSide: side,
            targetSide,
            sourceIndex: index,
            targetIndex,
            sourceCount: rail.length,
            targetCount,
            label: readEdgeLabel(sourcePort, targetPort),
            state: mergeEdgeState(sourcePort, targetPort),
          });
        }
      }
    }
  }
  return edges;
}

function resolveAnchor(
  node: Node<InternalNodeData>,
  side: Side,
  index: number,
  count: number,
): { x: number; y: number; position: Position } {
  const width = Number(node.measured?.width ?? node.width ?? node.style?.width ?? 220);
  const height = Number(node.measured?.height ?? node.height ?? 72);
  const ratio = (index + 0.5) / Math.max(count, 1);

  switch (side) {
    case "left":
      return {
        x: node.position.x - 18,
        y: node.position.y + (height * ratio),
        position: Position.Left,
      };
    case "right":
      return {
        x: node.position.x + width + 18,
        y: node.position.y + (height * ratio),
        position: Position.Right,
      };
    case "top":
      return {
        x: node.position.x + (width * ratio),
        y: node.position.y - 18,
        position: Position.Top,
      };
    case "bottom":
      return {
        x: node.position.x + (width * ratio),
        y: node.position.y + height + 18,
        position: Position.Bottom,
      };
  }
}

function resolveNodeEndpoints(ports: InfiniteCanvasPorts | null | undefined) {
  const sourcePosition = Array.isArray(ports?.right) && ports.right.length > 0
    ? Position.Right
    : Array.isArray(ports?.bottom) && ports.bottom.length > 0
      ? Position.Bottom
      : undefined;
  const targetPosition = Array.isArray(ports?.left) && ports.left.length > 0
    ? Position.Left
    : Array.isArray(ports?.top) && ports.top.length > 0
      ? Position.Top
      : undefined;
  return { sourcePosition, targetPosition };
}

export const InfiniteCanvas = forwardRef<InfiniteCanvasRef, InfiniteCanvasProps>(function InfiniteCanvas(
  {
    stateKey,
    canvasState,
    onCanvasStateCommit,
    getInitialNodePos,
    nodes: nodeDescriptors = [],
    nodePorts,
    renderNode,
    renderNodePort,
    minZoom = 0.24,
    maxZoom = 1.35,
    fitViewOptions,
    miniMap = false,
    controls = false,
    background = DEFAULT_BACKGROUND,
    overlay = null,
    panOnScroll = true,
    selectionOnDrag = true,
    proOptions = DEFAULT_PRO_OPTIONS,
    className,
    viewportClassName,
    onViewportChange,
    onNodeClick,
    onEdgeClick,
  },
  ref
) {
  const [instance, setInstance] = useState<ReactFlowInstance<Node<InternalNodeData>, Edge> | null>(null);
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<InternalNodeData>>([]);
  const [isReady, setIsReady] = useState(false);
  const [viewportState, setViewportState] = useState<Viewport | null>(canvasState?.viewport ?? null);
  const graphEdges = deriveEdgesFromNodePorts(nodeDescriptors, nodePorts);
  const overlayViewport = viewportState ?? { x: 0, y: 0, zoom: 1 };
  const nodeTypesRef = useRef(NODE_TYPES);

  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;
  const nodePortsRef = useRef(nodePorts);
  nodePortsRef.current = nodePorts;
  const nodeDescriptorsRef = useRef(nodeDescriptors);
  nodeDescriptorsRef.current = nodeDescriptors;
  const renderNodeRef = useRef(renderNode);
  renderNodeRef.current = renderNode;
  const renderNodePortRef = useRef(renderNodePort);
  renderNodePortRef.current = renderNodePort;
  const getInitialNodePosRef = useRef(getInitialNodePos);
  getInitialNodePosRef.current = getInitialNodePos;
  const onCommitRef = useRef(onCanvasStateCommit);
  onCommitRef.current = onCanvasStateCommit;
  const rfNodesRef = useRef(rfNodes);
  rfNodesRef.current = rfNodes;

  const committedBlobRef = useRef(normalizeBlob(canvasState));
  const viewportRef = useRef<Viewport | null>(canvasState?.viewport ?? null);
  const hasInitializedViewportRef = useRef(false);

  const resolvePlacement = useCallback((descriptor: InfiniteCanvasNodeDescriptor, index: number, placed: Record<string, XYPosition>) => {
    const seeded = committedBlobRef.current?.nodes?.[descriptor.id];
    if (seeded && Number.isFinite(seeded.x) && Number.isFinite(seeded.y)) {
      return { position: { x: seeded.x, y: seeded.y }, fromInitial: false };
    }
    const initial = getInitialNodePosRef.current?.(descriptor, {
      index,
      nodeCount: nodeDescriptorsRef.current.length,
      nodes: nodeDescriptorsRef.current,
      placed,
    });
    if (initial && Number.isFinite(initial.x) && Number.isFinite(initial.y)) {
      return { position: { x: initial.x, y: initial.y }, fromInitial: true };
    }
    return { position: { x: 0, y: 0 }, fromInitial: true };
  }, []);

  const buildData = useCallback((descriptor: InfiniteCanvasNodeDescriptor): InternalNodeData => ({
    __node: descriptor,
    __ports: resolvePortsForDescriptor(descriptor, nodePortsRef.current),
    __renderNode: renderNodeRef.current,
    __renderNodePort: renderNodePortRef.current,
  }), []);

  const makeNode = useCallback((descriptor: InfiniteCanvasNodeDescriptor, position: XYPosition): Node<InternalNodeData> => {
    const width = descriptor.width;
    const ports = resolvePortsForDescriptor(descriptor, nodePortsRef.current);
    const { sourcePosition, targetPosition } = resolveNodeEndpoints(ports);
    return {
      id: descriptor.id,
      type: CANVAS_FRAME_TYPE,
      position,
      draggable: descriptor.draggable ?? true,
      sourcePosition,
      targetPosition,
      style: Number.isFinite(width) ? { width } : undefined,
      data: buildData(descriptor),
    };
  }, [buildData]);

  const buildBlob = useCallback(() => {
    const nodesBlob: Record<string, { x: number; y: number }> = {};
    for (const node of rfNodesRef.current) {
      nodesBlob[node.id] = { x: node.position.x, y: node.position.y };
    }
    return {
      v: 1,
      viewport: viewportRef.current ?? committedBlobRef.current?.viewport ?? null,
      nodes: nodesBlob,
    };
  }, []);

  const commitGeometry = useCallback(() => {
    const blob = buildBlob();
    if (deepEqualView(blob, committedBlobRef.current)) return;
    committedBlobRef.current = blob;
    onCommitRef.current?.(blob);
  }, [buildBlob]);

  useEffect(() => {
    committedBlobRef.current = normalizeBlob(canvasStateRef.current);
    viewportRef.current = canvasStateRef.current?.viewport ?? null;
    hasInitializedViewportRef.current = false;
    setIsReady(false);

    const placed: Record<string, XYPosition> = {};
    const seeded = nodeDescriptorsRef.current.map((descriptor, index) => {
      const { position } = resolvePlacement(descriptor, index, placed);
      placed[descriptor.id] = position;
      return makeNode(descriptor, position);
    });
    setRfNodes(seeded);
  }, [stateKey, makeNode, resolvePlacement, setRfNodes]);

  useEffect(() => {
    setRfNodes((current) => {
      const currentById = new Map(current.map((node) => [node.id, node]));
      const placed: Record<string, XYPosition> = {};
      let changed = current.length !== nodeDescriptors.length;

      const next = nodeDescriptors.map((descriptor, index) => {
        const existing = currentById.get(descriptor.id);
        const position = existing
          ? existing.position
          : resolvePlacement(descriptor, index, placed).position;
        placed[descriptor.id] = position;

        const width = descriptor.width;
        const ports = resolvePortsForDescriptor(descriptor, nodePorts);

        if (
          existing
          && existing.position === position
          && existing.style?.width === width
          && existing.draggable === (descriptor.draggable ?? true)
          && deepEqualView(existing.data.__node, descriptor)
          && deepEqualView(existing.data.__ports, ports)
          && existing.data.__renderNode === renderNode
          && existing.data.__renderNodePort === renderNodePort
        ) {
          return existing;
        }

        changed = true;
        return {
          ...(existing ?? {}),
          id: descriptor.id,
          type: CANVAS_FRAME_TYPE,
          position,
          draggable: descriptor.draggable ?? true,
          ...resolveNodeEndpoints(ports),
          style: Number.isFinite(width) ? { width } : undefined,
          data: {
            __node: descriptor,
            __ports: ports,
            __renderNode: renderNode,
            __renderNodePort: renderNodePort,
          },
        } as Node<InternalNodeData>;
      });

      return changed ? next : current;
    });
  }, [nodeDescriptors, nodePorts, canvasState, renderNode, renderNodePort, resolvePlacement, setRfNodes]);

  useEffect(() => {
    if (rfNodes.length === 0) return;
    const committedNodes = committedBlobRef.current?.nodes ?? {};
    if (rfNodes.some((node) => !committedNodes[node.id])) {
      commitGeometry();
    }
  }, [rfNodes, commitGeometry]);

  useEffect(() => {
    if (!instance || rfNodes.length === 0 || hasInitializedViewportRef.current) {
      return undefined;
    }
    hasInitializedViewportRef.current = true;
    const seedViewport = committedBlobRef.current?.viewport ?? null;

    const frame = window.requestAnimationFrame(() => {
      if (seedViewport) {
        instance.setViewport?.(seedViewport, { duration: 0 });
        viewportRef.current = seedViewport;
      } else {
        instance.fitView?.({ duration: 0, padding: 0.18, minZoom: 0.35, maxZoom: 1.08, ...fitViewOptions });
        viewportRef.current = instance.getViewport?.() ?? null;
      }
      setViewportState(viewportRef.current);
      onViewportChange?.(viewportRef.current);
      setIsReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [instance, rfNodes.length, fitViewOptions]);

  const handleMoveEnd = useCallback(() => {
    viewportRef.current = instance?.getViewport?.() ?? viewportRef.current;
    setViewportState(viewportRef.current);
    onViewportChange?.(viewportRef.current);
    commitGeometry();
  }, [commitGeometry, instance, onViewportChange]);

  const handleNodeDragStop = useCallback(() => {
    const frame = window.requestAnimationFrame(() => commitGeometry());
    return () => window.cancelAnimationFrame(frame);
  }, [commitGeometry]);

  useImperativeHandle(ref, () => ({
    fitView: (opts) => (instance as { fitView?: (value?: unknown) => void } | null)?.fitView?.(opts),
    setViewport: (viewport, opts) => (instance as { setViewport?: (value: Viewport, options?: { duration?: number }) => void } | null)?.setViewport?.(viewport, opts),
    setCenter: (x, y, opts) => (instance as { setCenter?: (cx: number, cy: number, options?: { zoom?: number; duration?: number }) => void } | null)?.setCenter?.(x, y, opts),
    getViewport: () => (instance as { getViewport?: () => Viewport } | null)?.getViewport?.(),
    getNode: (id) => (instance as { getNode?: (nodeId: string) => Node | undefined } | null)?.getNode?.(id),
    instance,
  }), [instance]);

  const edgeOverlay = (
    <svg className="infinite-canvas-edge-overlay" viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id={`ic-edge-default-${stateKey}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line)" />
        </marker>
        <marker id={`ic-edge-selected-${stateKey}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
        </marker>
      </defs>
      <g transform={`translate(${overlayViewport.x} ${overlayViewport.y}) scale(${overlayViewport.zoom})`}>
        {graphEdges.map((edge) => {
          const sourceNode = rfNodes.find((node) => node.id === edge.source);
          const targetNode = rfNodes.find((node) => node.id === edge.target);
          if (!sourceNode || !targetNode) return null;
          const sourceAnchor = resolveAnchor(sourceNode, edge.sourceSide, edge.sourceIndex, edge.sourceCount);
          const targetAnchor = resolveAnchor(targetNode, edge.targetSide, edge.targetIndex, edge.targetCount);
          const curvature = resolveLeaderCurve(sourceAnchor.x, sourceAnchor.y, targetAnchor.x, targetAnchor.y, edge.state);
          const [edgePath, labelX, labelY] = getBezierPath({
            sourceX: sourceAnchor.x,
            sourceY: sourceAnchor.y,
            targetX: targetAnchor.x,
            targetY: targetAnchor.y,
            sourcePosition: sourceAnchor.position,
            targetPosition: targetAnchor.position,
            curvature,
          });
          const id = String(edge.id);
          const classes = [
            "infinite-canvas-edge",
            edge.state.selected ? "selected" : "",
            edge.state.highlighted ? "is-highlighted" : "",
            edge.state.dimmed ? "is-dimmed" : "",
            edge.state.running ? "is-running" : "",
          ].filter(Boolean).join(" ");
          const strokeColor = edge.state.highlighted || edge.state.selected
            ? "var(--accent)"
            : edge.state.dimmed
              ? "color-mix(in srgb, var(--line) 32%, transparent)"
              : "var(--line)";
          const flowColor = edge.state.highlighted || edge.state.selected
            ? "color-mix(in srgb, var(--accent) 78%, white)"
            : "color-mix(in srgb, var(--accent) 58%, transparent)";
          const mainStrokeWidth = edge.state.highlighted || edge.state.running || edge.state.selected ? 2.4 : 1.8;
          const labelClassName = [
            "infinite-canvas-edge-label",
            edge.state.highlighted || edge.state.selected ? "is-highlighted" : "",
            edge.state.running ? "is-running" : "",
          ].filter(Boolean).join(" ");
          return (
            <g
              key={id}
              className={classes}
              onClick={() => onEdgeClick?.(id)}
            >
              <path
                d={edgePath}
                className="infinite-canvas-edge__main"
                fill="none"
                stroke={strokeColor}
                strokeWidth={mainStrokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={edge.state.dimmed ? 0.18 : 1}
                markerEnd={`url(#ic-edge-${edge.state.highlighted || edge.state.selected ? "selected" : "default"}-${stateKey})`}
              />
              {edge.state.running ? (
                <path
                  d={edgePath}
                  className="infinite-canvas-edge__flow"
                  fill="none"
                  stroke={flowColor}
                  strokeWidth={mainStrokeWidth + 0.35}
                  strokeDasharray="10 12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={edge.state.dimmed ? 0.18 : 1}
                />
              ) : null}
              {edge.label ? (
                <text x={labelX} y={labelY} textAnchor="middle" className={labelClassName} opacity={edge.state.dimmed ? 0.12 : 1}>
                  {String(edge.label)}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );

  return (
    <div className={viewportClassName}>
      <ReactFlow<Node<InternalNodeData>>
        nodes={rfNodes}
        edges={[]}
        nodeTypes={nodeTypesRef.current}
        minZoom={minZoom}
        maxZoom={maxZoom}
        proOptions={proOptions}
        className={className}
        style={isReady ? undefined : { visibility: "hidden" }}
        panOnScroll={panOnScroll}
        selectionOnDrag={selectionOnDrag}
        onInit={setInstance}
        onMoveEnd={handleMoveEnd}
        onNodesChange={onNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
      >
        {edgeOverlay}
        {overlay}
        {miniMap ? <MiniMap pannable zoomable {...(typeof miniMap === "object" ? miniMap : {})} /> : null}
        {controls ? <Controls showInteractive={false} {...(typeof controls === "object" ? controls : {})} /> : null}
        {background ? <Background {...background} /> : null}
      </ReactFlow>
    </div>
  );
});

export default InfiniteCanvas;
