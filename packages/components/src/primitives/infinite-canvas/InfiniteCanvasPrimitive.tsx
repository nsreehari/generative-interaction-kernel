import React from "react";
import { Card, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";
import { Handle } from "@xyflow/react";
import {
  InfiniteCanvas,
  type InfiniteCanvasNodeDescriptor,
  type InfiniteCanvasPort,
  type InfiniteCanvasPortMap,
  type InfiniteCanvasPorts,
} from "./InfiniteCanvas";
import {
  defineComponent,
  eventContract,
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
} from "../../shared/definition";
import { componentRootProps, componentStylePropsSchema } from "../../shared/component";

export const INFINITE_CANVAS_VARIANTS = ["standard", "compact", "minimal"] as const;
export const INFINITE_CANVAS_SEMANTIC_TOKENS = ["accent", "danger", "warning", "success", "neutral"] as const;

type InfiniteCanvasVariant = typeof INFINITE_CANVAS_VARIANTS[number];
type InfiniteCanvasToken = typeof INFINITE_CANVAS_SEMANTIC_TOKENS[number];

export interface DeclarativeInfiniteCanvasNode extends InfiniteCanvasNodeDescriptor {
  title: string;
  detail?: string;
  eyebrow?: string;
  tone?: InfiniteCanvasToken;
}

const canvasThemeVariables = {
  "--xy-edge-stroke": tokens.colorNeutralStrokeAccessible,
  "--xy-edge-stroke-selected": tokens.colorBrandStroke1,
  "--xy-connectionline-stroke": tokens.colorBrandStroke1,
  "--xy-background-color": tokens.colorNeutralBackground2,
  "--xy-background-pattern-color": tokens.colorNeutralStroke2,
  "--xy-minimap-background-color": tokens.colorNeutralBackground1,
  "--xy-minimap-mask-background-color": tokens.colorNeutralBackgroundAlpha2,
  "--xy-minimap-node-background-color": tokens.colorNeutralBackground3,
  "--xy-minimap-node-stroke-color": tokens.colorNeutralStroke1,
  "--xy-selection-background-color": tokens.colorBrandBackground2,
  "--xy-selection-border": `1px dotted ${tokens.colorBrandStroke1}`,
} as React.CSSProperties;

export interface DeclarativeInfiniteCanvasModel {
  nodes: DeclarativeInfiniteCanvasNode[];
  nodePorts: Record<string, InfiniteCanvasPorts | null | undefined>;
}

const portSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "token"],
  properties: {
    id: { type: "string", minLength: 1 },
    token: { type: "string", minLength: 1 },
    label: { type: "string" },
    selected: { type: "boolean" },
    highlighted: { type: "boolean" },
    dimmed: { type: "boolean" },
    running: { type: "boolean" },
  },
} as const;

const portsSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  properties: {
    top: { type: "array", items: portSchema },
    bottom: { type: "array", items: portSchema },
    left: { type: "array", items: portSchema },
    right: { type: "array", items: portSchema },
  },
} as const;

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["stateKey", "nodes", "nodePorts"],
  properties: {
    ...componentStylePropsSchema,
    stateKey: { type: "string", minLength: 1 },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title"],
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          detail: { type: "string" },
          eyebrow: { type: "string" },
          tone: { enum: INFINITE_CANVAS_SEMANTIC_TOKENS },
          width: { type: "number", minimum: 120, maximum: 640 },
          draggable: { type: "boolean" },
        },
      },
    },
    nodePorts: { type: "object", additionalProperties: portsSchema },
    canvasState: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        v: { type: "number" },
        viewport: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["x", "y", "zoom"],
          properties: { x: { type: "number" }, y: { type: "number" }, zoom: { type: "number" } },
        },
        nodes: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y"],
            properties: { x: { type: "number" }, y: { type: "number" } },
          },
        },
      },
    },
    variant: { enum: INFINITE_CANVAS_VARIANTS },
    height: { type: ["number", "string"] },
    minZoom: { type: "number", exclusiveMinimum: 0 },
    maxZoom: { type: "number", exclusiveMinimum: 0 },
    miniMap: { type: "boolean" },
    controls: { type: "boolean" },
    background: { type: "boolean" },
    panOnScroll: { type: "boolean" },
    selectionOnDrag: { type: "boolean" },
    ariaLabel: { type: "string", minLength: 1 },
  },
} as const;

const useStyles = makeStyles({
  root: {
    position: "relative",
    width: "100%",
    minWidth: 0,
    minHeight: "20rem",
    overflow: "hidden",
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    "& .react-flow__controls": { borderRadius: tokens.borderRadiusMedium, boxShadow: tokens.shadow4, overflow: "hidden" },
    "& .react-flow__controls-button": { color: tokens.colorNeutralForeground1, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, cursor: "pointer" },
    "& .react-flow__controls-button:hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  viewport: { width: "100%", height: "100%" },
  node: {
    width: "100%",
    minWidth: 0,
    padding: tokens.spacingHorizontalL,
    borderTop: `4px solid ${tokens.colorNeutralStroke1}`,
    boxShadow: tokens.shadow4,
  },
  compactNode: { padding: tokens.spacingHorizontalM },
  minimalNode: { padding: tokens.spacingHorizontalS, boxShadow: tokens.shadow2 },
  accent: { borderTopColor: tokens.colorBrandBackground },
  danger: { borderTopColor: tokens.colorPaletteRedBackground3 },
  warning: { borderTopColor: tokens.colorPaletteDarkOrangeBackground3 },
  success: { borderTopColor: tokens.colorPaletteGreenBackground3 },
  eyebrow: { display: "block", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100, fontWeight: tokens.fontWeightSemibold, textTransform: "uppercase" },
  title: { display: "block", marginTop: tokens.spacingVerticalXXS, overflowWrap: "anywhere" },
  detail: { display: "block", marginTop: tokens.spacingVerticalXS, color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" },
  port: { width: "10px", height: "10px", border: `2px solid ${tokens.colorNeutralBackground1}`, borderRadius: "50%", backgroundColor: tokens.colorBrandBackground, boxShadow: `0 0 0 1px ${tokens.colorBrandBackground}` },
  accessibleSummary: { position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 },
});

function nodeClass(styles: ReturnType<typeof useStyles>, tone: InfiniteCanvasToken | undefined, variant: InfiniteCanvasVariant): string {
  return mergeClasses(
    styles.node,
    variant === "compact" && styles.compactNode,
    variant === "minimal" && styles.minimalNode,
    tone === "accent" && styles.accent,
    tone === "danger" && styles.danger,
    tone === "warning" && styles.warning,
    tone === "success" && styles.success,
  );
}

export const InfiniteCanvasPrimitive: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const descriptors = Array.isArray(node.props.nodes) ? node.props.nodes as unknown as DeclarativeInfiniteCanvasNode[] : [];
  const nodePorts = node.props.nodePorts && typeof node.props.nodePorts === "object" && !Array.isArray(node.props.nodePorts)
    ? node.props.nodePorts as unknown as InfiniteCanvasPortMap
    : {};
  const variant = INFINITE_CANVAS_VARIANTS.includes(node.props.variant as InfiniteCanvasVariant)
    ? node.props.variant as InfiniteCanvasVariant
    : "standard";
  const height = typeof node.props.height === "number" || typeof node.props.height === "string" ? node.props.height : "32rem";
  const root = componentRootProps(node, styles.root);
  return <section {...root} style={{ ...canvasThemeVariables, ...root.style, height }} aria-label={typeof node.props.ariaLabel === "string" ? node.props.ariaLabel : "Infinite canvas"}>
    <ul className={styles.accessibleSummary}>{descriptors.map((descriptor) => <li key={descriptor.id}>{descriptor.title}{descriptor.detail ? `: ${descriptor.detail}` : ""}</li>)}</ul>
    <InfiniteCanvas
      stateKey={String(node.props.stateKey ?? node.id)}
      canvasState={node.props.canvasState as never}
      nodes={descriptors}
      nodePorts={nodePorts}
      minZoom={typeof node.props.minZoom === "number" ? node.props.minZoom : undefined}
      maxZoom={typeof node.props.maxZoom === "number" ? node.props.maxZoom : undefined}
      miniMap={node.props.miniMap === true}
      controls={node.props.controls === true}
      background={node.props.background === false ? false : undefined}
      panOnScroll={node.props.panOnScroll !== false}
      selectionOnDrag={node.props.selectionOnDrag !== false}
      viewportClassName={styles.viewport}
      getInitialNodePos={(_, context) => ({ x: (context.index % 3) * 300, y: Math.floor(context.index / 3) * 210 })}
      renderNode={(descriptor) => {
        const item = descriptor as DeclarativeInfiniteCanvasNode;
        return <Card appearance="outline" className={nodeClass(styles, item.tone, variant)}>
          {item.eyebrow && variant !== "minimal" ? <Text className={styles.eyebrow}>{item.eyebrow}</Text> : null}
          <Text className={styles.title} weight="semibold" size={variant === "standard" ? 400 : 300}>{item.title}</Text>
          {item.detail && variant === "standard" ? <Text className={styles.detail} size={200}>{item.detail}</Text> : null}
        </Card>;
      }}
      renderNodePort={(port: InfiniteCanvasPort, context) => <Handle id={String(port.id)} type={context.side === "left" || context.side === "top" ? "target" : "source"} position={context.position} className={styles.port} title={typeof port.label === "string" ? port.label : undefined} />}
      onCanvasStateCommit={(value) => { void emit("layout", { value: value as unknown as Json }); }}
      onNodeClick={(id) => { void emit("node", { id }); }}
      onEdgeClick={(id) => { void emit("edge", { id }); }}
    />
  </section>;
};

const description: ComponentDescription = {
  capability: "primitive:infinite-canvas",
  summary: "Renders declarative node cards on a persistent pan-and-zoom canvas and derives edges from matching node-port tokens.",
  dataProp: "nodes",
  events: ["node", "edge", "layout"],
  eventContracts: {
    node: eventContract("The user selects a canvas node.", { id: { type: "string" } }),
    edge: eventContract("The user selects a derived canvas edge.", { id: { type: "string" } }),
    layout: eventContract("The canvas commits its current viewport and node positions.", { value: { type: "object", additionalProperties: true } }),
  },
  semanticTokens: INFINITE_CANVAS_SEMANTIC_TOKENS,
  defaultVariant: "standard",
  variants: [
    { value: "standard", summary: "Full node cards with eyebrow, title, and detail.", useWhen: ["The graph is a primary exploratory surface", "Node detail should remain visible"] },
    { value: "compact", summary: "Compact cards with eyebrow and title.", useWhen: ["The graph contains many nodes", "Labels matter more than prose detail"] },
    { value: "minimal", summary: "Small title-only cards.", useWhen: ["Topology is the primary information", "The canvas must accommodate a dense graph"] },
  ],
  authoring: {
    useWhen: ["Users need to pan, zoom, and reposition a node topology", "Connections can be represented by matching source and target port tokens"],
    avoidWhen: ["A static relationship list is sufficient", "The data has no stable node identities"],
    rules: ["Provide unique stable node ids", "Declare input ports on left or top and output ports on right or bottom", "Use one shared token for each intended source-target connection", "Do not author an explicit edge array", "Persist layout events back into canvasState when layout continuity is required"],
  },
};

export function getInfiniteCanvasSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function describeInfiniteCanvas(): ComponentDescription { return description; }
export function validateInfiniteCanvas(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([
    { kind: "ajv-schema", schema: getInfiniteCanvasSchema(), message: "Invalid primitive:infinite-canvas props", code: "primitive-infinite-canvas-schema" },
    { kind: "jsonata", expr: "$count(data.nodes.id) = $count($distinct(data.nodes.id))", message: "Infinite canvas node ids must be unique", code: "infinite-canvas-unique-node-id" },
  ], props as Json);
}
export function materializeInfiniteCanvasTrial() {
  return trialNode("primitive:infinite-canvas", {
    stateKey: "infinite-canvas-trial",
    variant: "standard",
    height: 420,
    controls: true,
    nodes: [
      { id: "source", title: "Source system", detail: "Observed identity provider", eyebrow: "Origin", tone: "neutral", width: 240 },
      { id: "target", title: "Protected resource", detail: "Accessed application", eyebrow: "Target", tone: "danger", width: 240 },
    ],
    nodePorts: {
      source: { right: [{ id: "access:source", token: "relationship:access", label: "accessed" }] },
      target: { left: [{ id: "access:target", token: "relationship:access", label: "accessed" }] },
    },
  });
}
export const infiniteCanvasDefinition = defineComponent({ description, version: "1.0.0", component: InfiniteCanvasPrimitive, getSchema: getInfiniteCanvasSchema, validate: validateInfiniteCanvas, materializeTrial: materializeInfiniteCanvasTrial });
