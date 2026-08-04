import React from "react";
import { Badge, Card, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import type { ComponentValidationReport } from "../../shared/definition";
import { componentRootProps, componentStylePropsSchema, records, textAt, type BadgeColor } from "../../shared/component";

export const EVIDENCE_TRAIL_SEMANTIC_TOKENS = ["corroborating", "contradicting", "uncertain", "primary", "context"] as const;
export const EVIDENCE_TRAIL_VARIANTS = ["detailed", "compact"] as const;
type EvidenceToken = typeof EVIDENCE_TRAIL_SEMANTIC_TOKENS[number];
const schema = {
  $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["evidence", "spec"],
  properties: { ...componentStylePropsSchema, evidence: { type: "array", items: { type: "object" } }, variant: { enum: EVIDENCE_TRAIL_VARIANTS }, spec: { type: "object", additionalProperties: false, required: ["fields"], properties: {
    title: { type: "string" }, emptyText: { type: "string" }, fields: { type: "object", additionalProperties: false, required: ["title", "source"], properties: { id: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 }, source: { type: "string", minLength: 1 }, excerpt: { type: "string", minLength: 1 }, timestamp: { type: "string", minLength: 1 }, tone: { type: "string", minLength: 1 } } }, toneMap: { type: "object", additionalProperties: { enum: EVIDENCE_TRAIL_SEMANTIC_TOKENS } },
  } } },
} as const;
type EvidenceSpec = { title?: string; emptyText?: string; fields: { id?: string; title: string; source: string; excerpt?: string; timestamp?: string; tone?: string }; toneMap?: Record<string, EvidenceToken> };
const useStyles = makeStyles({ root: { display: "grid", gap: tokens.spacingVerticalM }, trail: { display: "grid", gap: tokens.spacingVerticalS, borderLeft: `${tokens.strokeWidthThick} solid ${tokens.colorNeutralStroke2}`, paddingLeft: tokens.spacingHorizontalL }, item: { display: "grid", gap: tokens.spacingVerticalS }, compactItem: { gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center" }, header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: tokens.spacingHorizontalS }, meta: { color: tokens.colorNeutralForeground3 }, excerpt: { color: tokens.colorNeutralForeground2, borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, paddingLeft: tokens.spacingHorizontalM } });
function color(token: EvidenceToken): BadgeColor { if (token === "corroborating") return "success"; if (token === "contradicting") return "danger"; if (token === "uncertain") return "warning"; if (token === "primary") return "brand"; return "informative"; }
export const EvidenceTrail: ProjectionView = ({ node }) => {
  const styles = useStyles(); const evidence = records(node.props.evidence); const spec = (node.props.spec ?? {}) as EvidenceSpec; const compact = (node.props.variant ?? "detailed") === "compact";
  if (!spec.fields || evidence.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No evidence available."}</Text>;
  return <section {...componentRootProps(node, styles.root)} aria-label={spec.title ?? "Evidence trail"}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}<div className={styles.trail}>{evidence.map((item, index) => { const toneValue = textAt(item, spec.fields.tone); const token = toneValue ? spec.toneMap?.[toneValue] : undefined; return <Card className={mergeClasses(styles.item, compact && styles.compactItem)} appearance="outline" key={textAt(item, spec.fields.id) || `${textAt(item, spec.fields.title)}-${index}`}>
    <div><div className={styles.header}><Text weight="semibold">{textAt(item, spec.fields.title)}</Text>{token ? <Badge appearance="tint" color={color(token)}>{toneValue}</Badge> : null}</div><Text className={styles.meta} size={200}>{[textAt(item, spec.fields.source), textAt(item, spec.fields.timestamp)].filter(Boolean).join(" · ")}</Text>{!compact && spec.fields.excerpt && textAt(item, spec.fields.excerpt) ? <Text className={styles.excerpt}>{textAt(item, spec.fields.excerpt)}</Text> : null}</div>
  </Card>; })}</div></section>;
};
export function getEvidenceTrailSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateEvidenceTrail(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema: getEvidenceTrailSchema(), message: "Invalid evidence-case renderer props", code: "evidence-case-renderer-schema" }], props as Json); }