import React from "react";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { infiniteCanvasDefinition } from "../../primitives/infinite-canvas";
import { componentNode, defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";
import { AttackGraph, ATTACK_GRAPH_SEMANTIC_TOKENS, getAttackGraphSchema, validateAttackGraph } from "../attack-graph";

export const ATTACK_PATH_VARIANTS = ["canvas", "diagram", "relations", "gantt", "text"] as const;

const schema = (() => {
  const value = JSON.parse(JSON.stringify(getAttackGraphSchema())) as Record<string, any>;
  value.properties.variant = { enum: ATTACK_PATH_VARIANTS };
  value.properties.spec.properties.density = { enum: ["comfortable", "compact"] };
  return value as Record<string, unknown>;
})();

function delegatedProps(props: Record<string, Json>): Record<string, Json> {
  const spec = { ...((props.spec ?? {}) as Record<string, Json>) };
  delete spec.density;
  return { ...props, variant: typeof props.variant === "string" ? props.variant : "canvas", spec };
}

export const AttackPath: ProjectionView = ({ node, emit }) => <AttackGraph node={componentNode(`${node.id}-attack-graph`, "security:attack-path", delegatedProps(node.props))} emit={emit} children={undefined} />;

const description: ComponentDescription = {
  capability: "security:attack-path", summary: "Presents directed adversarial activity as a canvas, diagram, relations, temporal intervals, or text.", dataProp: "graph", events: ["node", "edge", "layout"], eventContracts: infiniteCanvasDefinition.eventContracts, semanticTokens: ATTACK_GRAPH_SEMANTIC_TOKENS, defaultVariant: "canvas",
  variants: ATTACK_PATH_VARIANTS.map((value) => ({ value, summary: `${value} attack-path presentation.`, useWhen: [`The ${value} presentation best matches the investigation surface`] })),
  authoring: { useWhen: ["Directed adversarial activity connects security entities"], avoidWhen: ["The relationships are not adversarial; use semantic:relationship-set", "Only event chronology matters"], rules: ["Preserve stable entity and relationship identities", "Use relationship start and end fields for gantt", "Put density and canvas mechanics in spec or root props"] },
};

export function getAttackPathSchema(): Record<string, unknown> { return schema; }
export function validateAttackPath(props: unknown): ComponentValidationReport {
  const report = runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid security:attack-path props", code: "security-attack-path-schema" }], props as Json);
  if (!report.ok) return report;
  return validateAttackGraph(delegatedProps(props as Record<string, Json>));
}
export function materializeAttackPathTrial() { return trialNode("security:attack-path", { variant: "canvas", stateKey: "attack-path-trial", graph: { entities: [{ id: "attacker", label: "Threat actor", detail: "Observed source", type: "Actor", status: "observed" }, { id: "identity", label: "Admin identity", detail: "Compromised principal", type: "Identity", status: "compromised" }, { id: "mailbox", label: "Finance mailbox", detail: "Accessed resource", type: "Mailbox", status: "affected" }], relationships: [{ id: "authenticate", sourceId: "attacker", targetId: "identity", label: "authenticated as", start: "2026-07-17T23:09:23Z", end: "2026-07-17T23:09:27Z" }, { id: "access", sourceId: "identity", targetId: "mailbox", label: "accessed", start: "2026-07-17T23:09:25Z", end: "2026-07-17T23:09:34Z" }] }, spec: { title: "Attack path", density: "comfortable", entityFields: { id: "id", label: "label", detail: "detail", type: "type", tone: "status" }, relationshipFields: { id: "id", source: "sourceId", target: "targetId", label: "label", start: "start", end: "end" }, toneMap: { observed: "neutral", compromised: "danger", affected: "warning" } } }); }
export const attackPathDefinition = defineComponent({ description, version: "1.0.0", component: AttackPath, getSchema: getAttackPathSchema, validate: validateAttackPath, materializeTrial: materializeAttackPathTrial });