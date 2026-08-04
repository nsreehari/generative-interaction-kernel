import React from "react";
import { Badge, Card, CardHeader, Divider, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import type { ComponentValidationReport } from "../../shared/definition";
import { asRecord, componentRootProps, componentStylePropsSchema, textAt, type BadgeColor } from "../../shared/component";

export const DECISION_SUMMARY_SEMANTIC_TOKENS = ["affirmative", "cautionary", "negative", "uncertain", "neutral"] as const;
export const DECISION_SUMMARY_VARIANTS = ["detailed", "concise"] as const;
type DecisionToken = typeof DECISION_SUMMARY_SEMANTIC_TOKENS[number];
type DecisionSummaryVariant = typeof DECISION_SUMMARY_VARIANTS[number];
const decisionSummaryPropsSchema = {
  $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["decision", "spec"],
  properties: {
    ...componentStylePropsSchema,
    decision: { type: "object" },
    variant: { enum: DECISION_SUMMARY_VARIANTS },
    spec: { type: "object", additionalProperties: false, required: ["fields"], properties: {
      eyebrow: { type: "string" }, emptyText: { type: "string" },
      fields: { type: "object", additionalProperties: false, required: ["title", "summary", "outcome"], properties: {
        title: { type: "string", minLength: 1 }, summary: { type: "string", minLength: 1 }, outcome: { type: "string", minLength: 1 },
        rationale: { type: "string", minLength: 1 }, confidence: { type: "string", minLength: 1 }, impact: { type: "string", minLength: 1 }, tone: { type: "string", minLength: 1 },
      } },
      labels: { type: "object", additionalProperties: false, properties: { rationale: { type: "string" }, confidence: { type: "string" }, impact: { type: "string" } } },
      toneMap: { type: "object", additionalProperties: { enum: DECISION_SUMMARY_SEMANTIC_TOKENS } },
    } },
  },
} as const;
type DecisionSpec = { eyebrow?: string; emptyText?: string; fields: { title: string; summary: string; outcome: string; rationale?: string; confidence?: string; impact?: string; tone?: string }; labels?: { rationale?: string; confidence?: string; impact?: string }; toneMap?: Record<string, DecisionToken> };
const useStyles = makeStyles({ root: { display: "grid", gap: tokens.spacingVerticalL }, conciseRoot: { gap: tokens.spacingVerticalS }, header: { display: "grid", gap: tokens.spacingVerticalXS }, eyebrow: { color: tokens.colorNeutralForeground3 }, summary: { color: tokens.colorNeutralForeground2 }, facts: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))", gap: tokens.spacingHorizontalL }, fact: { display: "grid", gap: tokens.spacingVerticalXXS }, label: { color: tokens.colorNeutralForeground3 } });
function tokenColor(token: DecisionToken): BadgeColor { if (token === "affirmative") return "success"; if (token === "cautionary") return "warning"; if (token === "negative") return "danger"; return "informative"; }
export const DecisionSummary: ProjectionView = ({ node }) => {
  const styles = useStyles(); const decision = asRecord(node.props.decision); const spec = (node.props.spec ?? {}) as DecisionSpec;
  const variant = (node.props.variant ?? "detailed") as DecisionSummaryVariant;
  if (!spec.fields || Object.keys(decision).length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No decision available."}</Text>;
  const outcome = textAt(decision, spec.fields.outcome); const toneValue = textAt(decision, spec.fields.tone) || outcome; const token = spec.toneMap?.[toneValue];
  const facts = [[spec.labels?.confidence ?? "Confidence", spec.fields.confidence], [spec.labels?.impact ?? "Impact", spec.fields.impact], [spec.labels?.rationale ?? "Rationale", spec.fields.rationale]] as const;
  return <Card {...componentRootProps(node, mergeClasses(styles.root, variant === "concise" && styles.conciseRoot))} appearance="outline"><CardHeader header={<div className={styles.header}>{spec.eyebrow ? <Text className={styles.eyebrow} size={200}>{spec.eyebrow}</Text> : null}<Text weight="semibold" size={600}>{textAt(decision, spec.fields.title)}</Text><div>{token ? <Badge appearance="filled" color={tokenColor(token)}>{outcome}</Badge> : <Badge appearance="outline">{outcome}</Badge>}</div><Text className={styles.summary}>{textAt(decision, spec.fields.summary)}</Text></div>} />{variant === "detailed" ? <><Divider /><div className={styles.facts}>{facts.flatMap(([label, field]) => field && textAt(decision, field) ? [<div className={styles.fact} key={label}><Text className={styles.label} size={200}>{label}</Text><Text weight="semibold">{textAt(decision, field)}</Text></div>] : [])}</div></> : null}</Card>;
};
export function getDecisionSummarySchema(): Record<string, unknown> { return decisionSummaryPropsSchema as unknown as Record<string, unknown>; }
export function validateDecisionSummary(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema: getDecisionSummarySchema(), message: "Invalid decision renderer props", code: "decision-renderer-schema" }], props as Json); }