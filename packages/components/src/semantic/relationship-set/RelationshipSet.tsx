import React from "react";
import { Badge, Card, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { GraphDiagram, type GraphDiagramModel } from "../../primitives/graph-diagram";
import { asRecord, componentRootProps, componentStylePropsSchema, records, textAt, type BadgeColor, type DataRecord } from "../../shared/component";
import { componentNode, defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

export const RELATIONSHIP_SET_SEMANTIC_TOKENS = ["central", "related", "risk", "positive", "neutral"] as const;
export const RELATIONSHIP_SET_VARIANTS = ["network", "matrix", "relations", "text"] as const;
type RelationshipToken = typeof RELATIONSHIP_SET_SEMANTIC_TOKENS[number];
type RelationshipSetVariant = typeof RELATIONSHIP_SET_VARIANTS[number];

interface RelationshipSetSpec {
  title?: string;
  description?: string;
  emptyText?: string;
  density?: "comfortable" | "compact";
  entityFields: { id: string; label: string; detail?: string; type?: string; tone?: string };
  relationshipFields: { id: string; source: string; target: string; label?: string };
  toneMap?: Record<string, RelationshipToken>;
}

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["graph", "spec"],
  properties: {
    ...componentStylePropsSchema, variant: { enum: RELATIONSHIP_SET_VARIANTS },
    graph: { type: "object", additionalProperties: false, required: ["entities", "relationships"], properties: { entities: { type: "array", items: { type: "object" } }, relationships: { type: "array", items: { type: "object" } } } },
    spec: { type: "object", additionalProperties: false, required: ["entityFields", "relationshipFields"], properties: {
      title: { type: "string" }, description: { type: "string" }, emptyText: { type: "string" }, density: { enum: ["comfortable", "compact"] },
      entityFields: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, detail: { type: "string", minLength: 1 }, type: { type: "string", minLength: 1 }, tone: { type: "string", minLength: 1 } } },
      relationshipFields: { type: "object", additionalProperties: false, required: ["id", "source", "target"], properties: { id: { type: "string", minLength: 1 }, source: { type: "string", minLength: 1 }, target: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } },
      toneMap: { type: "object", additionalProperties: { enum: RELATIONSHIP_SET_SEMANTIC_TOKENS } },
    } },
  },
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0 },
  header: { display: "grid", gap: tokens.spacingVerticalXXS },
  description: { color: tokens.colorNeutralForeground3 },
  matrixWrap: { overflowX: "auto" },
  matrix: { width: "100%", borderCollapse: "collapse" },
  matrixCell: { minWidth: "7rem", padding: tokens.spacingVerticalS, textAlign: "left", border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  relations: { display: "grid", gap: tokens.spacingVerticalS },
  relation: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: tokens.spacingHorizontalM },
  endpoint: { display: "grid", gap: tokens.spacingVerticalXXS, minWidth: 0 },
  target: { textAlign: "right" },
  relationLabel: { color: tokens.colorNeutralForeground3, textAlign: "center" },
  text: { display: "grid", gap: tokens.spacingVerticalXS },
});

function tokenColor(token: RelationshipToken | undefined): BadgeColor {
  if (token === "central") return "brand";
  if (token === "risk") return "danger";
  if (token === "positive") return "success";
  return "informative";
}

export const RelationshipSet: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const graph = asRecord(node.props.graph);
  const entities = records(graph.entities);
  const relationships = records(graph.relationships);
  const spec = (node.props.spec ?? {}) as unknown as RelationshipSetSpec;
  const variant = (node.props.variant ?? "network") as RelationshipSetVariant;
  if (!spec.entityFields || !spec.relationshipFields || entities.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No relationships available."}</Text>;
  const byId = new Map(entities.map((entity) => [textAt(entity, spec.entityFields.id), entity]));
  const root = componentRootProps(node, styles.root);
  const header = <div className={styles.header}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text className={styles.description}>{spec.description}</Text> : null}</div>;
  const statement = (relationship: DataRecord) => { const source = byId.get(textAt(relationship, spec.relationshipFields.source)); const target = byId.get(textAt(relationship, spec.relationshipFields.target)); return source && target ? `${textAt(source, spec.entityFields.label)} ${textAt(relationship, spec.relationshipFields.label) || "relates to"} ${textAt(target, spec.entityFields.label)}` : ""; };

  if (variant === "text") return <section {...root}>{header}<div className={styles.text}>{relationships.map((relationship) => <Text key={textAt(relationship, spec.relationshipFields.id)}>{statement(relationship)}</Text>)}</div></section>;

  if (variant === "matrix") return <section {...root}>{header}<div className={styles.matrixWrap}><table className={styles.matrix}><thead><tr><th className={styles.matrixCell}>From / to</th>{entities.map((entity) => <th className={styles.matrixCell} key={textAt(entity, spec.entityFields.id)}>{textAt(entity, spec.entityFields.label)}</th>)}</tr></thead><tbody>{entities.map((source) => <tr key={textAt(source, spec.entityFields.id)}><th className={styles.matrixCell}>{textAt(source, spec.entityFields.label)}</th>{entities.map((target) => { const matches = relationships.filter((relationship) => textAt(relationship, spec.relationshipFields.source) === textAt(source, spec.entityFields.id) && textAt(relationship, spec.relationshipFields.target) === textAt(target, spec.entityFields.id)); return <td className={styles.matrixCell} key={textAt(target, spec.entityFields.id)}>{matches.map((relationship) => textAt(relationship, spec.relationshipFields.label) || "related").join(", ")}</td>; })}</tr>)}</tbody></table></div></section>;

  if (variant === "relations") return <section {...root}>{header}<div className={styles.relations}>{relationships.map((relationship) => { const source = byId.get(textAt(relationship, spec.relationshipFields.source)); const target = byId.get(textAt(relationship, spec.relationshipFields.target)); if (!source || !target) return null; const sourceTone = textAt(source, spec.entityFields.tone); const targetTone = textAt(target, spec.entityFields.tone); return <Card appearance="outline" className={styles.relation} key={textAt(relationship, spec.relationshipFields.id)}><div className={styles.endpoint}><Text weight="semibold">{textAt(source, spec.entityFields.label)}</Text>{sourceTone ? <Badge appearance="tint" color={tokenColor(spec.toneMap?.[sourceTone])}>{sourceTone}</Badge> : null}</div><Text className={styles.relationLabel} size={200}>{textAt(relationship, spec.relationshipFields.label) || "related to"}</Text><div className={mergeClasses(styles.endpoint, styles.target)}><Text weight="semibold">{textAt(target, spec.entityFields.label)}</Text>{targetTone ? <Badge appearance="tint" color={tokenColor(spec.toneMap?.[targetTone])}>{targetTone}</Badge> : null}</div></Card>; })}</div></section>;

  const graphModel: GraphDiagramModel = {
    nodes: entities.map((entity) => {
      const token = spec.toneMap?.[textAt(entity, spec.entityFields.tone)];
      return {
        id: textAt(entity, spec.entityFields.id),
        label: textAt(entity, spec.entityFields.label),
        detail: textAt(entity, spec.entityFields.detail) || undefined,
        category: textAt(entity, spec.entityFields.type) || undefined,
        tone: token === "central" ? "accent" : token === "risk" ? "danger" : token === "positive" ? "success" : "neutral",
      };
    }),
    edges: relationships.map((relationship) => ({
      id: textAt(relationship, spec.relationshipFields.id),
      source: textAt(relationship, spec.relationshipFields.source),
      target: textAt(relationship, spec.relationshipFields.target),
      label: textAt(relationship, spec.relationshipFields.label) || undefined,
      directed: true,
    })),
  };
  return <GraphDiagram node={componentNode(`${node.id}-network`, "primitive:graph-diagram", {
    graph: graphModel as unknown as Json,
    variant: "diagram",
    spec: {
      ...(spec.title ? { title: spec.title } : {}),
      ...(spec.description ? { description: spec.description } : {}),
      ...(spec.emptyText ? { emptyText: spec.emptyText } : {}),
      layout: "radial",
    },
    ...(typeof node.props.className === "string" ? { className: node.props.className } : {}),
    ...(node.props.style ? { style: node.props.style } : {}),
  })} emit={() => undefined} children={undefined} />;
};

const description: ComponentDescription = {
  capability: "semantic:relationship-set", summary: "Presents one authored entity and relationship set as a network, matrix, relation statements, or text.", dataProp: "graph", events: [], semanticTokens: RELATIONSHIP_SET_SEMANTIC_TOKENS, defaultVariant: "network",
  variants: [
    { value: "network", summary: "Node-link topology projection.", useWhen: ["Topology and connected structure are primary"] },
    { value: "matrix", summary: "Pairwise entity relationship matrix.", useWhen: ["Dense pairwise inspection matters"] },
    { value: "relations", summary: "Readable source-predicate-target statements.", useWhen: ["Precise relationship reading matters"] },
    { value: "text", summary: "Complete linear relationship statements.", useWhen: ["Visual layout is unavailable or inappropriate"] },
  ],
  authoring: { useWhen: ["Explicit relationships connect stable entities"], avoidWhen: ["Only grouped entities matter; use entity-set"], rules: ["All variants consume the same entities and relationships", "Reference only declared entity IDs", "Matrix cells and network edges are derived without changing relationships", "Put density in spec"] },
};

export function getRelationshipSetSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateRelationshipSet(props: unknown): ComponentValidationReport { return runDeclarativeValidators([
  { kind: "ajv-schema", schema: getRelationshipSetSchema(), message: "Invalid semantic:relationship-set props", code: "relationship-set-schema" },
  { kind: "jsonata", expr: "($field := data.spec.entityFields.id; $ids := data.graph.entities.$lookup($, $field); $count($ids) = $count($distinct($ids)))", message: "Relationship-set entity IDs must be unique", code: "relationship-set-unique-entity-id" },
  { kind: "jsonata", expr: "($entityField := data.spec.entityFields.id; $sourceField := data.spec.relationshipFields.source; $targetField := data.spec.relationshipFields.target; $ids := data.graph.entities.$lookup($, $entityField); $count(data.graph.relationships[$lookup($, $sourceField) in $ids and $lookup($, $targetField) in $ids]) = $count(data.graph.relationships))", message: "Relationships must reference declared entity IDs", code: "relationship-set-reference" },
], props as Json); }
export function materializeRelationshipSetTrial() { return trialNode("semantic:relationship-set", { variant: "network", graph: { entities: [{ id: "identity", label: "Admin identity", detail: "Affected principal", role: "focus" }, { id: "device", label: "New device", detail: "Registered credential", role: "risk" }, { id: "application", label: "Finance app", detail: "Accessed resource", role: "related" }], relationships: [{ id: "registered", from: "identity", to: "device", relation: "registered" }, { id: "accessed", from: "identity", to: "application", relation: "accessed" }] }, spec: { title: "Incident relationships", description: "Entities linked by observed activity", density: "comfortable", entityFields: { id: "id", label: "label", detail: "detail", tone: "role" }, relationshipFields: { id: "id", source: "from", target: "to", label: "relation" }, toneMap: { focus: "central", risk: "risk", related: "related" } } }); }
export const relationshipSetDefinition = defineComponent({ description, version: "1.0.0", component: RelationshipSet, getSchema: getRelationshipSetSchema, validate: validateRelationshipSet, materializeTrial: materializeRelationshipSetTrial });