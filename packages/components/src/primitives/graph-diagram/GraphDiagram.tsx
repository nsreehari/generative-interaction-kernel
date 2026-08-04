import React from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import {
  InfiniteCanvasPrimitive,
  infiniteCanvasDefinition,
  type DeclarativeInfiniteCanvasModel,
} from "../infinite-canvas";
import { componentRootProps, componentStylePropsSchema } from "../../shared/component";
import { componentNode, defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

export const GRAPH_DIAGRAM_VARIANTS = ["diagram", "canvas"] as const;
export const GRAPH_DIAGRAM_TONES = ["accent", "danger", "warning", "success", "neutral"] as const;

type GraphDiagramVariant = typeof GRAPH_DIAGRAM_VARIANTS[number];
type GraphDiagramTone = typeof GRAPH_DIAGRAM_TONES[number];

export interface GraphDiagramNode {
  id: string;
  label: string;
  detail?: string;
  category?: string;
  tone?: GraphDiagramTone;
}

export interface GraphDiagramEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  directed?: boolean;
}

export interface GraphDiagramModel {
  nodes: GraphDiagramNode[];
  edges: GraphDiagramEdge[];
}

interface GraphDiagramSpec {
  title?: string;
  description?: string;
  emptyText?: string;
  layout?: "radial" | "hierarchical";
  interaction?: { pan?: boolean; zoom?: boolean; selection?: boolean };
}

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["graph", "spec"],
  properties: {
    ...componentStylePropsSchema,
    graph: {
      type: "object",
      additionalProperties: false,
      required: ["nodes", "edges"],
      properties: {
        nodes: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: {
          id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, detail: { type: "string" }, category: { type: "string" }, tone: { enum: GRAPH_DIAGRAM_TONES },
        } } },
        edges: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "source", "target"], properties: {
          id: { type: "string", minLength: 1 }, source: { type: "string", minLength: 1 }, target: { type: "string", minLength: 1 }, label: { type: "string" }, directed: { type: "boolean" },
        } } },
      },
    },
    variant: { enum: GRAPH_DIAGRAM_VARIANTS },
    spec: { type: "object", additionalProperties: false, properties: {
      title: { type: "string" }, description: { type: "string" }, emptyText: { type: "string" }, layout: { enum: ["radial", "hierarchical"] },
      interaction: { type: "object", additionalProperties: false, properties: { pan: { type: "boolean" }, zoom: { type: "boolean" }, selection: { type: "boolean" } } },
    } },
    stateKey: { type: "string", minLength: 1 }, canvasState: { type: ["object", "null"] }, height: { type: ["number", "string"] }, miniMap: { type: "boolean" }, controls: { type: "boolean" }, background: { type: "boolean" },
  },
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0 },
  header: { display: "grid", gap: tokens.spacingVerticalXXS },
  description: { color: tokens.colorNeutralForeground3 },
  diagram: { width: "100%", minHeight: "20rem", backgroundColor: tokens.colorNeutralBackground2, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
});

function toneFill(tone: GraphDiagramTone | undefined): string {
  if (tone === "accent") return tokens.colorBrandBackground;
  if (tone === "danger") return tokens.colorPaletteRedBackground3;
  if (tone === "warning") return tokens.colorPaletteDarkOrangeBackground3;
  if (tone === "success") return tokens.colorPaletteGreenBackground3;
  return tokens.colorNeutralBackground4;
}

function toneForeground(tone: GraphDiagramTone | undefined): string {
  return tone && tone !== "neutral" ? tokens.colorNeutralForegroundOnBrand : tokens.colorNeutralForeground1;
}

function positions(nodes: GraphDiagramNode[], layout: GraphDiagramSpec["layout"]) {
  if (layout === "hierarchical") {
    const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    return new Map(nodes.map((node, index) => [node.id, { x: columns === 1 ? 320 : 120 + (index % columns) * (400 / (columns - 1)), y: 80 + Math.floor(index / columns) * 150 }]));
  }
  return new Map(nodes.map((node, index) => { const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length) - Math.PI / 2; const radius = nodes.length <= 3 ? 105 : 135; return [node.id, { x: 320 + Math.cos(angle) * radius, y: 180 + Math.sin(angle) * radius }]; }));
}

function wrapLabel(label: string, maxLineLength = 26): string[] {
  const words = label.split(/\s+/).flatMap((word) => word.length <= maxLineLength ? [word] : word.match(new RegExp(`.{1,${maxLineLength}}`, "g")) ?? [word]);
  return words.reduce<string[]>((lines, word) => {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > maxLineLength) lines.push(word);
    else lines[lines.length - 1] = `${current} ${word}`;
    return lines;
  }, []);
}

export function buildGraphCanvasModel(graph: GraphDiagramModel): DeclarativeInfiniteCanvasModel {
  const nodePorts: DeclarativeInfiniteCanvasModel["nodePorts"] = Object.fromEntries(graph.nodes.map((node) => [node.id, {}]));
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) continue;
    const token = `edge:${edge.id}`;
    nodePorts[edge.source] = { ...nodePorts[edge.source], right: [...(nodePorts[edge.source]?.right ?? []), { id: `${edge.id}:source`, token, label: edge.label ?? "" }] };
    nodePorts[edge.target] = { ...nodePorts[edge.target], left: [...(nodePorts[edge.target]?.left ?? []), { id: `${edge.id}:target`, token, label: edge.label ?? "" }] };
  }
  return { nodes: graph.nodes.map((node) => ({ id: node.id, title: node.label, detail: node.detail, eyebrow: node.category, tone: node.tone, width: 250 })), nodePorts };
}

export const GraphDiagram: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const graph = (node.props.graph ?? { nodes: [], edges: [] }) as unknown as GraphDiagramModel;
  const spec = (node.props.spec ?? {}) as unknown as GraphDiagramSpec;
  const variant = (node.props.variant ?? "diagram") as GraphDiagramVariant;
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No graph data."}</Text>;
  const header = spec.title || spec.description ? <header className={styles.header}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text className={styles.description}>{spec.description}</Text> : null}</header> : null;

  if (variant === "canvas") {
    const model = buildGraphCanvasModel(graph);
    return <section {...componentRootProps(node, styles.root)}>{header}<InfiniteCanvasPrimitive node={componentNode(`${node.id}-canvas`, "primitive:infinite-canvas", {
      nodes: model.nodes as unknown as Json, nodePorts: model.nodePorts as unknown as Json, stateKey: String(node.props.stateKey ?? node.id), canvasState: (node.props.canvasState ?? null) as Json,
      height: node.props.height ?? "34rem", variant: "standard", miniMap: node.props.miniMap ?? spec.interaction?.zoom !== false, controls: node.props.controls ?? spec.interaction?.zoom !== false, background: node.props.background ?? true, panOnScroll: spec.interaction?.pan !== false, selectionOnDrag: spec.interaction?.selection !== false,
      ariaLabel: spec.title ?? "Graph diagram",
    })} emit={emit} children={undefined} /></section>;
  }

  const byId = positions(graph.nodes, spec.layout ?? "radial");
  return <section {...componentRootProps(node, styles.root)}>{header}<svg className={styles.diagram} viewBox="0 0 640 360" role="img"><title>{spec.title ?? "Graph diagram"}</title><desc>{spec.description ?? `${graph.nodes.length} nodes and ${graph.edges.length} edges`}</desc>
    <defs><marker id={`${node.id}-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={tokens.colorNeutralStroke1} /></marker></defs>
    {graph.edges.map((edge) => { const source = byId.get(edge.source); const target = byId.get(edge.target); if (!source || !target) return null; return <g key={edge.id}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={tokens.colorNeutralStroke1} strokeWidth="2" markerEnd={edge.directed ? `url(#${node.id}-arrow)` : undefined} />{edge.label ? <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6} textAnchor="middle" fill={tokens.colorNeutralForeground3} fontSize="11">{edge.label}</text> : null}</g>; })}
    {graph.nodes.map((item) => { const position = byId.get(item.id)!; const lines = wrapLabel(item.label); const longLabel = lines.length > 1; const textY = position.y - ((lines.length - 1) * 7); return <g key={item.id} aria-label={item.label}><title>{item.label}</title>{longLabel ? <rect x={position.x - 105} y={position.y - 42} width="210" height="84" rx="8" fill={toneFill(item.tone)} stroke={tokens.colorNeutralStroke1} /> : <circle cx={position.x} cy={position.y} r="46" fill={toneFill(item.tone)} stroke={tokens.colorNeutralStroke1} />}<text x={position.x} y={textY} textAnchor="middle" dominantBaseline="middle" fill={toneForeground(item.tone)} fontSize="13">{lines.map((line, index) => <tspan x={position.x} dy={index === 0 ? 0 : 14} key={`${item.id}-${index}`}>{line}</tspan>)}</text></g>; })}
  </svg></section>;
};

const description: ComponentDescription = {
  capability: "primitive:graph-diagram", summary: "Renders normalized nodes and edges as a static diagram or interactive canvas without assigning relationship meaning.", dataProp: "graph", events: ["node", "edge", "layout"], eventContracts: infiniteCanvasDefinition.eventContracts, semanticTokens: GRAPH_DIAGRAM_TONES, defaultVariant: "diagram",
  variants: [
    { value: "diagram", summary: "Static node-edge diagram.", useWhen: ["Topology should be inspected without canvas interaction"] },
    { value: "canvas", summary: "Interactive pan-and-zoom graph canvas.", useWhen: ["Users need to explore or reposition a larger graph"] },
  ],
  authoring: { useWhen: ["A caller has already normalized records into nodes and edges"], avoidWhen: ["Relationship meaning or domain validation has not yet been resolved"], rules: ["Provide stable unique node and edge IDs", "Reference only declared node IDs", "Assign semantic meaning before lowering into this primitive"] },
};

export function getGraphDiagramSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateGraphDiagram(props: unknown): ComponentValidationReport { return runDeclarativeValidators([
  { kind: "ajv-schema", schema: getGraphDiagramSchema(), message: "Invalid primitive:graph-diagram props", code: "graph-diagram-schema" },
  { kind: "jsonata", expr: "$count(data.graph.nodes.id) = $count($distinct(data.graph.nodes.id)) and $count(data.graph.edges.id) = $count($distinct(data.graph.edges.id))", message: "Graph node and edge IDs must be unique", code: "graph-diagram-unique-id" },
  { kind: "jsonata", expr: "($ids := data.graph.nodes.id; $count(data.graph.edges[source in $ids and target in $ids]) = $count(data.graph.edges))", message: "Graph edges must reference declared node IDs", code: "graph-diagram-reference" },
], props as Json); }
export function materializeGraphDiagramTrial() { return trialNode("primitive:graph-diagram", { variant: "diagram", graph: { nodes: [{ id: "source", label: "Source", tone: "accent" }, { id: "target", label: "Target", tone: "neutral" }], edges: [{ id: "connection", source: "source", target: "target", label: "connects", directed: true }] }, spec: { title: "Graph diagram", layout: "radial" } }); }
export const graphDiagramDefinition = defineComponent({ description, version: "1.0.0", component: GraphDiagram, getSchema: getGraphDiagramSchema, validate: validateGraphDiagram, materializeTrial: materializeGraphDiagramTrial });