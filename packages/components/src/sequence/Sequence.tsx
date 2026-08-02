import React from "react";
import { Badge, Card, CardHeader, Divider, Text, makeStyles, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { trialNode, type ComponentDescription, type ComponentValidationReport, type DeclarativeComponentDefinition } from "../definition";
import { records, textAt, type BadgeColor } from "../shared";

export const SEQUENCE_SEMANTIC_TOKENS = ["complete", "current", "upcoming", "blocked", "skipped", "unknown"] as const;
export const SEQUENCE_VARIANTS = ["standard", "compact"] as const;
type SequenceToken = typeof SEQUENCE_SEMANTIC_TOKENS[number];
type SequenceVariant = typeof SEQUENCE_VARIANTS[number];

const sequencePropsSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["items", "spec"],
  properties: {
    items: { type: "array", items: { type: "object" } },
    variant: { enum: SEQUENCE_VARIANTS },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["fields"],
      properties: {
        title: { type: "string" }, description: { type: "string" }, emptyText: { type: "string" },
        orientation: { enum: ["horizontal", "vertical"] },
        fields: {
          type: "object", additionalProperties: false, required: ["id", "title"],
          properties: {
            id: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 },
            detail: { type: "string", minLength: 1 }, order: { type: "string", minLength: 1 },
            status: { type: "string", minLength: 1 }, reference: { type: "string", minLength: 1 },
          },
        },
        toneMap: { type: "object", additionalProperties: { enum: SEQUENCE_SEMANTIC_TOKENS } },
      },
    },
  },
} as const;

type SequenceSpec = {
  title?: string; description?: string; emptyText?: string; orientation?: "horizontal" | "vertical";
  fields: { id: string; title: string; detail?: string; order?: string; status?: string; reference?: string };
  toneMap?: Record<string, SequenceToken>;
};

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM },
  compactRoot: { gap: tokens.spacingVerticalS },
  heading: { display: "grid", gap: tokens.spacingVerticalXXS },
  list: { display: "flex", gap: tokens.spacingHorizontalM, margin: 0, padding: 0, listStyle: "none", flexWrap: "wrap" },
  compactList: { gap: tokens.spacingHorizontalS },
  vertical: { flexDirection: "column" },
  step: { display: "grid", gap: tokens.spacingVerticalXS, flex: "1 1 12rem", minWidth: 0 },
  compactStep: { gap: tokens.spacingVerticalXXS, flexBasis: "9rem" },
  titleRow: { display: "flex", gap: tokens.spacingHorizontalS, alignItems: "center", flexWrap: "wrap" },
  detail: { color: tokens.colorNeutralForeground3 },
});

function tokenColor(token: SequenceToken): BadgeColor {
  if (token === "complete") return "success";
  if (token === "current") return "brand";
  if (token === "upcoming") return "informative";
  if (token === "blocked") return "danger";
  if (token === "skipped") return "subtle";
  return "informative";
}

export const Sequence: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const items = records(node.props.items);
  const spec = (node.props.spec ?? {}) as SequenceSpec;
  const variant = (node.props.variant ?? "standard") as SequenceVariant;
  if (!spec.fields || items.length === 0) return <Text>{spec.emptyText ?? "No sequence data."}</Text>;
  const ordered = spec.fields.order ? [...items].sort((left, right) => Number(textAt(left, spec.fields.order)) - Number(textAt(right, spec.fields.order))) : items;
  return <Card className={`${styles.root} ${variant === "compact" ? styles.compactRoot : ""}`} appearance="outline">
    {spec.title || spec.description ? <CardHeader header={<div className={styles.heading}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text>{spec.description}</Text> : null}</div>} /> : null}
    <ol className={`${styles.list} ${variant === "compact" ? styles.compactList : ""} ${spec.orientation === "vertical" ? styles.vertical : ""}`}>
      {ordered.map((item, index) => {
        const status = textAt(item, spec.fields.status);
        const token = spec.toneMap?.[status];
        return <React.Fragment key={textAt(item, spec.fields.id) || index}>
          {index > 0 ? <Divider vertical={spec.orientation !== "vertical"} /> : null}
          <li className={`${styles.step} ${variant === "compact" ? styles.compactStep : ""}`}>
            <div className={styles.titleRow}><Text weight="semibold">{textAt(item, spec.fields.title)}</Text>{token ? <Badge appearance="tint" color={tokenColor(token)}>{status}</Badge> : null}</div>
            {spec.fields.reference && textAt(item, spec.fields.reference) ? <Text size={200}>{textAt(item, spec.fields.reference)}</Text> : null}
            {spec.fields.detail && textAt(item, spec.fields.detail) ? <Text className={styles.detail}>{textAt(item, spec.fields.detail)}</Text> : null}
          </li>
        </React.Fragment>;
      })}
    </ol>
  </Card>;
};

const description: ComponentDescription = {
  capability: "semantic:sequence", summary: "Presents records whose primary relationship is logical or procedural order.", dataProp: "items", events: [], semanticTokens: SEQUENCE_SEMANTIC_TOKENS,
  defaultVariant: "standard",
  variants: [
    { value: "standard", summary: "Full procedural sequence for a primary workflow view.", useWhen: ["The sequence is central to the task", "Step detail should remain prominent"] },
    { value: "compact", summary: "Denser procedural sequence for supporting surfaces.", useWhen: ["The sequence shares space with other evidence", "Rapid step scanning matters more than emphasis"] },
  ],
  authoring: {
    useWhen: ["Steps have meaningful logical order", "Users need to understand progression or dependency"],
    avoidWhen: ["Timestamp is the primary relationship; use timeline", "Records form a network; use semantic-graph"],
    rules: ["Map a stable identity and title", "Use order only for sortable numeric values", "Choose only a declared variant", "Map statuses only to recognized sequence tokens"],
  },
};
export function describeSequence() { return description; }
export function getSequenceSchema(): Record<string, unknown> { return sequencePropsSchema as unknown as Record<string, unknown>; }
export function validateSequence(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema: getSequenceSchema(), message: "Invalid semantic:sequence props", code: "semantic-sequence-schema" }], props as Json);
}
export function materializeSequenceTrial() {
  return trialNode("semantic:sequence", {
    variant: "standard",
    items: [{ key: "s1", order: 1, label: "Detect", state: "done", detail: "Signal identified" }, { key: "s2", order: 2, label: "Investigate", state: "active", detail: "Evidence under review" }],
    spec: { title: "Response sequence", fields: { id: "key", title: "label", order: "order", detail: "detail", status: "state" }, toneMap: { done: "complete", active: "current" } },
  });
}
export const sequenceDefinition: DeclarativeComponentDefinition = { capability: description.capability, version: "1.1.0", summary: description.summary, dataProp: description.dataProp, events: description.events, semanticTokens: description.semanticTokens, defaultVariant: description.defaultVariant, variants: description.variants, authoring: description.authoring, component: Sequence, describe: describeSequence, getSchema: getSequenceSchema, validate: validateSequence, materializeTrial: materializeSequenceTrial };