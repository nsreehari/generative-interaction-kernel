import React from "react";
import { Badge, Card, Text, makeStyles, tokens, type BadgeProps } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { GraphDiagram, type GraphDiagramModel } from "../../primitives/graph-diagram";
import { asRecord, componentRootProps, componentStylePropsSchema, records, textAt, type DataRecord } from "../../shared/component";
import { componentNode, defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

export const ARGUMENT_SEMANTIC_TOKENS = ["conclusion", "premise", "evidence", "objection", "neutral"] as const;
export const ARGUMENT_VARIANTS = ["map", "outline", "text"] as const;
type ArgumentRole = Exclude<typeof ARGUMENT_SEMANTIC_TOKENS[number], "neutral">;
type ArgumentVariant = typeof ARGUMENT_VARIANTS[number];
type ArgumentRelationKind = "supports" | "opposes" | "qualifies";

interface ArgumentSpec {
  title?: string;
  description?: string;
  emptyText?: string;
  density?: "comfortable" | "compact";
}

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["argument", "spec"],
  properties: {
    ...componentStylePropsSchema, variant: { enum: ARGUMENT_VARIANTS },
    argument: { type: "object", additionalProperties: false, required: ["claims", "relations"], properties: {
      claims: { type: "array", minItems: 1, items: {
        type: "object", additionalProperties: false, required: ["id", "statement", "role"], properties: {
          id: { type: "string", minLength: 1 }, statement: { type: "string", minLength: 1 }, detail: { type: "string" }, role: { enum: ["conclusion", "premise", "evidence", "objection"] },
        },
      } },
      relations: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["id", "source", "target", "kind"], properties: {
          id: { type: "string", minLength: 1 }, source: { type: "string", minLength: 1 }, target: { type: "string", minLength: 1 }, kind: { enum: ["supports", "opposes", "qualifies"] },
        },
      } },
    } },
    spec: { type: "object", additionalProperties: false, properties: {
      title: { type: "string" }, description: { type: "string" }, emptyText: { type: "string" }, density: { enum: ["comfortable", "compact"] },
    } },
  },
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0 },
  compact: { gap: tokens.spacingVerticalS },
  header: { display: "grid", gap: tokens.spacingVerticalXXS },
  description: { color: tokens.colorNeutralForeground3 },
  claims: { display: "grid", gap: tokens.spacingVerticalS },
  claim: { display: "grid", gap: tokens.spacingVerticalS },
  claimHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: tokens.spacingHorizontalM },
  detail: { color: tokens.colorNeutralForeground2 },
  relations: { display: "grid", gap: tokens.spacingVerticalXXS, paddingLeft: tokens.spacingHorizontalL },
  relation: { color: tokens.colorNeutralForeground3 },
  text: { display: "grid", gap: tokens.spacingVerticalS },
});

function roleColor(role: ArgumentRole): BadgeProps["color"] {
  if (role === "conclusion") return "brand";
  if (role === "evidence") return "success";
  if (role === "objection") return "danger";
  return "informative";
}

function claimRole(claim: DataRecord): ArgumentRole {
  return textAt(claim, "role") as ArgumentRole;
}

function relationKind(relation: DataRecord): ArgumentRelationKind {
  return textAt(relation, "kind") as ArgumentRelationKind;
}

export const Argument: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const argument = asRecord(node.props.argument);
  const claims = records(argument.claims);
  const relations = records(argument.relations);
  const spec = (node.props.spec ?? {}) as unknown as ArgumentSpec;
  const variant = (node.props.variant ?? "map") as ArgumentVariant;
  if (claims.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No argument available."}</Text>;

  const byId = new Map(claims.map((claim) => [textAt(claim, "id"), claim]));
  const root = componentRootProps(node, styles.root, spec.density === "compact" && styles.compact);
  const header = <div className={styles.header}>{spec.title ? <Text as="h2" weight="semibold" size={600}>{spec.title}</Text> : null}{spec.description ? <Text className={styles.description}>{spec.description}</Text> : null}</div>;

  if (variant === "text") return <section {...root}>{header}<div className={styles.text}>{claims.map((claim) => <Text key={textAt(claim, "id")}>[{claimRole(claim)}] {textAt(claim, "statement")}{textAt(claim, "detail") ? `: ${textAt(claim, "detail")}` : ""}</Text>)}{relations.map((relation) => <Text key={textAt(relation, "id")}>{textAt(byId.get(textAt(relation, "source")) ?? {}, "statement")} {relationKind(relation)} {textAt(byId.get(textAt(relation, "target")) ?? {}, "statement")}</Text>)}</div></section>;

  if (variant === "outline") return <section {...root}>{header}<div className={styles.claims}>{claims.map((claim) => {
    const outgoing = relations.filter((relation) => textAt(relation, "source") === textAt(claim, "id"));
    return <Card appearance="outline" className={styles.claim} key={textAt(claim, "id")}><div className={styles.claimHeader}><Text weight="semibold">{textAt(claim, "statement")}</Text><Badge appearance="tint" color={roleColor(claimRole(claim))}>{claimRole(claim)}</Badge></div>{textAt(claim, "detail") ? <Text className={styles.detail}>{textAt(claim, "detail")}</Text> : null}{outgoing.length > 0 ? <div className={styles.relations}>{outgoing.map((relation) => <Text className={styles.relation} size={200} key={textAt(relation, "id")}>{relationKind(relation)}: {textAt(byId.get(textAt(relation, "target")) ?? {}, "statement")}</Text>)}</div> : null}</Card>;
  })}</div></section>;

  const graph: GraphDiagramModel = {
    nodes: claims.map((claim) => ({
      id: textAt(claim, "id"),
      label: textAt(claim, "statement"),
      detail: textAt(claim, "detail") || undefined,
      category: claimRole(claim),
      tone: claimRole(claim) === "conclusion" ? "accent" : claimRole(claim) === "evidence" ? "success" : claimRole(claim) === "objection" ? "danger" : "neutral",
    })),
    edges: relations.map((relation) => ({ id: textAt(relation, "id"), source: textAt(relation, "source"), target: textAt(relation, "target"), label: relationKind(relation), directed: true })),
  };
  return <GraphDiagram node={componentNode(`${node.id}-map`, "primitive:graph-diagram", {
    graph: graph as unknown as Json, variant: "diagram", spec: { ...(spec.title ? { title: spec.title } : {}), ...(spec.description ? { description: spec.description } : {}), ...(spec.emptyText ? { emptyText: spec.emptyText } : {}), layout: "hierarchical" },
    ...(typeof node.props.className === "string" ? { className: node.props.className } : {}), ...(node.props.style ? { style: node.props.style } : {}),
  })} emit={() => undefined} children={undefined} />;
};

const description: ComponentDescription = {
  capability: "semantic:argument", summary: "Presents authored claims and inferential links as an argument map, outline, or text.", dataProp: "argument", events: [], semanticTokens: ARGUMENT_SEMANTIC_TOKENS, defaultVariant: "map",
  variants: [
    { value: "map", summary: "Directed claim and inference topology.", useWhen: ["Inferential structure is primary"] },
    { value: "outline", summary: "Claim cards with their outgoing reasoning links.", useWhen: ["Claims and supporting detail need close reading"] },
    { value: "text", summary: "Complete linear claims and inference statements.", useWhen: ["Visual layout is unavailable or inappropriate"] },
  ],
  authoring: { useWhen: ["Claims are connected by explicit support, opposition, or qualification"], avoidWhen: ["Several positions merely differ without an authored inference structure"], rules: ["Use conclusion, premise, evidence, and objection only as authored claim roles", "Every relation must reference declared claim IDs", "Do not infer omitted links or collapse disagreement into opposition", "All variants preserve every claim and relation"] },
  agentFacing: {
    detail: {
      notes: ["Relations express authored inference, not merely visual connectivity."],
    },
  },
};

export function getArgumentSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateArgument(props: unknown): ComponentValidationReport { return runDeclarativeValidators([
  { kind: "ajv-schema", schema: getArgumentSchema(), message: "Invalid semantic:argument props", code: "argument-schema" },
  { kind: "jsonata", expr: "$count(data.argument.claims.id) = $count($distinct(data.argument.claims.id))", message: "Argument claim IDs must be unique", code: "argument-unique-claim-id" },
  { kind: "jsonata", expr: "$count(data.argument.relations.id) = $count($distinct(data.argument.relations.id))", message: "Argument relation IDs must be unique", code: "argument-unique-relation-id" },
  { kind: "jsonata", expr: "($ids := data.argument.claims.id; $count(data.argument.relations[source in $ids and target in $ids]) = $count(data.argument.relations))", message: "Argument relations must reference declared claim IDs", code: "argument-reference" },
], props as Json); }
export function materializeArgumentTrial() { return trialNode("semantic:argument", { variant: "map", argument: { claims: [{ id: "conclusion", statement: "Contain the affected identity", detail: "The observed activity creates an immediate lateral movement risk.", role: "conclusion" }, { id: "evidence", statement: "A new credential was registered", detail: "The registration followed an anomalous sign-in from an unfamiliar device.", role: "evidence" }, { id: "premise", statement: "Unfamiliar credential registration indicates account compromise", role: "premise" }, { id: "objection", statement: "The registration may have been legitimate", role: "objection" }], relations: [{ id: "evidence-supports-premise", source: "evidence", target: "premise", kind: "supports" }, { id: "premise-supports-conclusion", source: "premise", target: "conclusion", kind: "supports" }, { id: "objection-opposes-premise", source: "objection", target: "premise", kind: "opposes" }] }, spec: { title: "Containment argument", description: "Authored reasoning behind the recommended response", density: "comfortable" } }); }
export const argumentDefinition = defineComponent({ description, version: "1.0.0", component: Argument, getSchema: getArgumentSchema, validate: validateArgument, materializeTrial: materializeArgumentTrial });