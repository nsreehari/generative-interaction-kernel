import React from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import type { Json, ResolvedNode } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { GraphDiagram, buildGraphCanvasModel, type GraphDiagramModel } from "../../primitives/graph-diagram";
import { formatTimestamp } from "../../primitives/datetime";
import { Gantt, validateGantt, type GanttScale } from "../../primitives/gantt";
import { RelationshipSet } from "../../semantic/relationship-set";
import { componentNode, type ComponentValidationReport } from "../../shared/definition";
import { asRecord, componentRootProps, componentStylePropsSchema, readPath, records, textAt } from "../../shared/component";

export const ATTACK_GRAPH_VARIANTS = ["canvas", "diagram", "relations", "gantt", "text"] as const;
export const ATTACK_GRAPH_SEMANTIC_TOKENS = ["accent", "danger", "warning", "success", "neutral"] as const;
type AttackGraphToken = typeof ATTACK_GRAPH_SEMANTIC_TOKENS[number];

export interface AttackGraphSpec {
  title?: string;
  description?: string;
  emptyText?: string;
  entityFields: {
    id: string;
    label: string;
    detail?: string;
    type?: string;
    tone?: string;
  };
  relationshipFields: {
    id: string;
    source: string;
    target: string;
    label?: string;
    start?: string;
    end?: string;
  };
  ganttScale?: GanttScale;
  toneMap?: Record<string, AttackGraphToken>;
}

export interface AttackGraphData {
  entities: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
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
      required: ["entities", "relationships"],
      properties: {
        entities: { type: "array", items: { type: "object" } },
        relationships: { type: "array", items: { type: "object" } },
      },
    },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["entityFields", "relationshipFields"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        emptyText: { type: "string" },
        entityFields: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label"],
          properties: {
            id: { type: "string", minLength: 1 },
            label: { type: "string", minLength: 1 },
            detail: { type: "string", minLength: 1 },
            type: { type: "string", minLength: 1 },
            tone: { type: "string", minLength: 1 },
          },
        },
        relationshipFields: {
          type: "object",
          additionalProperties: false,
          required: ["id", "source", "target"],
          properties: {
            id: { type: "string", minLength: 1 },
            source: { type: "string", minLength: 1 },
            target: { type: "string", minLength: 1 },
            label: { type: "string", minLength: 1 },
            start: { type: "string", minLength: 1 },
            end: { type: "string", minLength: 1 },
          },
        },
        ganttScale: {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: {
            kind: { enum: ["datetime", "linear"] },
            hourFormat: { enum: ["24", "12"] },
            displayPrefix: { type: "string" },
            minimum: { type: "number" },
            maximum: { type: "number" },
            tickStep: { type: "number", exclusiveMinimum: 0 },
            showSeconds: { type: "boolean" },
            showTimeZone: { type: "boolean" },
          },
        },
        toneMap: { type: "object", additionalProperties: { enum: ATTACK_GRAPH_SEMANTIC_TOKENS } },
      },
    },
    variant: { enum: ATTACK_GRAPH_VARIANTS },
    stateKey: { type: "string", minLength: 1 },
    canvasState: { type: ["object", "null"] },
    height: { type: ["number", "string"] },
    miniMap: { type: "boolean" },
    controls: { type: "boolean" },
    background: { type: "boolean" },
    ariaLabel: { type: "string", minLength: 1 },
  },
  allOf: [{
    if: { properties: { variant: { const: "gantt" } }, required: ["variant"] },
    then: { properties: { spec: { properties: { relationshipFields: { required: ["start", "end"] } } } } },
  }],
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0 },
  header: { display: "grid", gap: tokens.spacingVerticalXXS },
  description: { color: tokens.colorNeutralForeground3 },
  textList: { display: "grid", gap: tokens.spacingVerticalS, margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  textItem: { display: "grid", gap: tokens.spacingVerticalXXS },
  textTimestamp: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
  textPredicate: { color: tokens.colorNeutralForeground3 },
});

function attackGraphHeader(styles: ReturnType<typeof useStyles>, spec: AttackGraphSpec) {
  if (!spec.title && !spec.description) return null;
  return <div className={styles.header}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text className={styles.description}>{spec.description}</Text> : null}</div>;
}

function entityLabels(graph: Record<string, unknown>, spec: AttackGraphSpec): Map<string, string> {
  return new Map(records(graph.entities).map((entity) => [textAt(entity, spec.entityFields.id), textAt(entity, spec.entityFields.label)]));
}

function relationshipTimestamp(relationship: Record<string, unknown>, spec: AttackGraphSpec, styles: ReturnType<typeof useStyles>): React.ReactNode {
  if (spec.ganttScale?.kind === "linear" || !spec.relationshipFields.start) return null;
  const startValue = readPath(relationship, spec.relationshipFields.start);
  if (typeof startValue !== "string" || !Number.isFinite(Date.parse(startValue))) return null;
  const options = { hourFormat: spec.ganttScale?.hourFormat, showSeconds: spec.ganttScale?.showSeconds, showTimeZone: spec.ganttScale?.showTimeZone };
  const endValue = spec.relationshipFields.end ? readPath(relationship, spec.relationshipFields.end) : undefined;
  const hasEnd = typeof endValue === "string" && Number.isFinite(Date.parse(endValue));
  return <Text className={styles.textTimestamp} size={200}><time dateTime={startValue}>{formatTimestamp(startValue, options)}</time>{hasEnd ? <> - <time dateTime={endValue}>{formatTimestamp(endValue, options)}</time></> : null}</Text>;
}

function renderTextGraph(node: ResolvedNode, graph: Record<string, unknown>, spec: AttackGraphSpec, styles: ReturnType<typeof useStyles>) {
  const labels = entityLabels(graph, spec);
  return <section {...componentRootProps(node, styles.root)} aria-label={node.props.ariaLabel as string ?? spec.title ?? "Attack path text"}>
    {attackGraphHeader(styles, spec)}
    <ol className={styles.textList}>{records(graph.relationships).map((relationship, index) => {
      const source = labels.get(textAt(relationship, spec.relationshipFields.source)) ?? textAt(relationship, spec.relationshipFields.source);
      const target = labels.get(textAt(relationship, spec.relationshipFields.target)) ?? textAt(relationship, spec.relationshipFields.target);
      const predicate = textAt(relationship, spec.relationshipFields.label) || "related to";
      return <li className={styles.textItem} key={textAt(relationship, spec.relationshipFields.id) || index}><span><Text weight="semibold">{source}</Text>{" "}<Text className={styles.textPredicate}>{predicate}</Text>{" "}<Text weight="semibold">{target}</Text></span>{relationshipTimestamp(relationship, spec, styles)}</li>;
    })}</ol>
  </section>;
}

function renderGanttGraph(node: ResolvedNode, graph: Record<string, unknown>, spec: AttackGraphSpec) {
  const labels = entityLabels(graph, spec);
  const startField = spec.relationshipFields.start ?? "";
  const endField = spec.relationshipFields.end ?? "";
  const intervals = records(graph.relationships).map((relationship, index) => ({
    id: textAt(relationship, spec.relationshipFields.id) || String(index),
    label: `${labels.get(textAt(relationship, spec.relationshipFields.source)) ?? textAt(relationship, spec.relationshipFields.source)} ${textAt(relationship, spec.relationshipFields.label) || "related to"} ${labels.get(textAt(relationship, spec.relationshipFields.target)) ?? textAt(relationship, spec.relationshipFields.target)}`,
    start: readPath(relationship, startField),
    end: readPath(relationship, endField),
  }));
  const primitiveNode: ResolvedNode = {
    ...node,
    capability: "primitive:gantt",
    props: {
      items: intervals as unknown as Json,
      variant: "standard",
      spec: {
        ...(spec.title ? { title: spec.title } : {}),
        ...(spec.description ? { description: spec.description } : {}),
        ...(spec.emptyText ? { emptyText: spec.emptyText } : {}),
        ...(spec.ganttScale ? { scale: spec.ganttScale as unknown as Json } : {}),
        fields: { id: "id", label: "label", start: "start", end: "end" },
      },
      ...(typeof node.props.className === "string" ? { className: node.props.className } : {}),
      ...(node.props.style ? { style: node.props.style } : {}),
    },
  };
  return <Gantt node={primitiveNode} emit={() => undefined} children={undefined} />;
}

export function buildAttackGraphModel(graphValue: unknown, spec: AttackGraphSpec): GraphDiagramModel {
  const graph = asRecord(graphValue);
  const entities = records(graph.entities);
  const relationships = records(graph.relationships);
  return { nodes: entities.map((entity) => {
    const toneValue = textAt(entity, spec.entityFields.tone);
    return {
      id: textAt(entity, spec.entityFields.id),
      label: textAt(entity, spec.entityFields.label),
      detail: textAt(entity, spec.entityFields.detail) || undefined,
      category: textAt(entity, spec.entityFields.type) || undefined,
      tone: spec.toneMap?.[toneValue] ?? "neutral",
    };
  }), edges: relationships.map((relationship) => ({ id: textAt(relationship, spec.relationshipFields.id), source: textAt(relationship, spec.relationshipFields.source), target: textAt(relationship, spec.relationshipFields.target), label: textAt(relationship, spec.relationshipFields.label) || undefined, directed: true })) };
}

export function buildAttackGraphCanvasModel(graphValue: unknown, spec: AttackGraphSpec) {
  return buildGraphCanvasModel(buildAttackGraphModel(graphValue, spec));
}

export const AttackGraph: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const graph = asRecord(node.props.graph);
  const spec = node.props.spec as unknown as AttackGraphSpec;
  const graphModel = buildAttackGraphModel(graph, spec);
  if (graphModel.nodes.length === 0) return <p>{spec.emptyText ?? "No attack graph data available."}</p>;
  const variant = ATTACK_GRAPH_VARIANTS.includes(node.props.variant as typeof ATTACK_GRAPH_VARIANTS[number])
    ? node.props.variant as typeof ATTACK_GRAPH_VARIANTS[number]
    : "canvas";
  if (variant === "text") return renderTextGraph(node, graph, spec, styles);
  if (variant === "gantt") return renderGanttGraph(node, graph, spec);
  if (variant === "relations") {
    const relationshipSetNode: ResolvedNode = {
      ...node,
      capability: "semantic:relationship-set",
      props: {
        graph: {
          entities: records(graph.entities) as unknown as Json,
          relationships: records(graph.relationships) as unknown as Json,
        },
        variant: "relations",
        spec: {
          ...(spec.title ? { title: spec.title } : {}),
          ...(spec.description ? { description: spec.description } : {}),
          ...(spec.emptyText ? { emptyText: spec.emptyText } : {}),
          entityFields: {
            id: spec.entityFields.id,
            label: spec.entityFields.label,
            ...(spec.entityFields.detail ? { detail: spec.entityFields.detail } : {}),
            ...(spec.entityFields.tone ? { tone: spec.entityFields.tone } : {}),
          },
          relationshipFields: {
            id: spec.relationshipFields.id,
            source: spec.relationshipFields.source,
            target: spec.relationshipFields.target,
            ...(spec.relationshipFields.label ? { label: spec.relationshipFields.label } : {}),
          },
          toneMap: Object.fromEntries(Object.entries(spec.toneMap ?? {}).map(([value, token]) => [value, token === "accent" ? "central" : token === "danger" || token === "warning" ? "risk" : token === "success" ? "positive" : "neutral"])),
        },
        ...(typeof node.props.className === "string" ? { className: node.props.className } : {}),
        ...(node.props.style ? { style: node.props.style } : {}),
      },
    };
    return <RelationshipSet node={relationshipSetNode} emit={emit} children={undefined} />;
  }
  return <GraphDiagram node={componentNode(`${node.id}-graph`, "primitive:graph-diagram", {
    graph: graphModel as unknown as Json,
    variant: variant === "canvas" ? "canvas" : "diagram",
    spec: { ...(spec.title ? { title: spec.title } : {}), ...(spec.description ? { description: spec.description } : {}), ...(spec.emptyText ? { emptyText: spec.emptyText } : {}), layout: "hierarchical" },
    stateKey: String(node.props.stateKey ?? node.id), canvasState: (node.props.canvasState ?? null) as Json, height: node.props.height ?? "34rem", miniMap: node.props.miniMap ?? true, controls: node.props.controls ?? true, background: node.props.background ?? true,
    ...(typeof node.props.className === "string" ? { className: node.props.className } : {}), ...(node.props.style ? { style: node.props.style } : {}),
  })} emit={emit} children={undefined} />;
};

export function getAttackGraphSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateAttackGraph(props: unknown): ComponentValidationReport {
  const report = runDeclarativeValidators([
    { kind: "ajv-schema", schema: getAttackGraphSchema(), message: "Invalid attack-path renderer props", code: "attack-path-renderer-schema" },
    { kind: "jsonata", expr: "($field := data.spec.entityFields.id; $ids := data.graph.entities.$lookup($, $field); $count($ids) = $count($distinct($ids)))", message: "Attack graph entity ids must be unique", code: "attack-graph-unique-entity-id" },
    { kind: "jsonata", expr: "($entityField := data.spec.entityFields.id; $sourceField := data.spec.relationshipFields.source; $targetField := data.spec.relationshipFields.target; $ids := data.graph.entities.$lookup($, $entityField); $count(data.graph.relationships[$lookup($, $sourceField) in $ids and $lookup($, $targetField) in $ids]) = $count(data.graph.relationships))", message: "Attack graph relationships must reference declared entity ids", code: "attack-graph-relationship-reference" },
  ], props as Json);
  const propsRecord = asRecord(props);
  if (!report.ok || propsRecord.variant !== "gantt") return report;
  const spec = asRecord(propsRecord.spec);
  const relationshipFields = asRecord(spec.relationshipFields);
  const graph = asRecord(propsRecord.graph);
  const ganttReport = validateGantt({
    items: graph.relationships,
    spec: {
      fields: {
        id: relationshipFields.id,
        label: relationshipFields.label ?? relationshipFields.source,
        start: relationshipFields.start,
        end: relationshipFields.end,
      },
      ...(spec.ganttScale ? { scale: spec.ganttScale } : {}),
    },
  });
  report.ok = ganttReport.ok;
  report.errors.push(...ganttReport.errors);
  report.warnings.push(...ganttReport.warnings);
  return report;
}
