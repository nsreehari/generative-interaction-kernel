import React from "react";
import { Badge, Card, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { trialNode, type ComponentDescription, type ComponentValidationReport, type DeclarativeComponentDefinition } from "../definition";
import { componentRootProps, componentStylePropsSchema, records, textAt, type BadgeColor } from "../shared";

export const METRIC_COMPARISON_SEMANTIC_TOKENS = ["positive", "negative", "warning", "neutral", "unknown"] as const;
export const METRIC_COMPARISON_VARIANTS = ["standard", "compact", "ranked"] as const;
type MetricToken = typeof METRIC_COMPARISON_SEMANTIC_TOKENS[number];
type MetricComparisonVariant = typeof METRIC_COMPARISON_VARIANTS[number];

const metricComparisonPropsSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["metrics", "spec"],
  properties: {
    ...componentStylePropsSchema,
    metrics: { type: "array", items: { type: "object" } },
    variant: { enum: METRIC_COMPARISON_VARIANTS },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["fields"],
      properties: {
        title: { type: "string" },
        emptyText: { type: "string" },
        fields: {
          type: "object",
          additionalProperties: false,
          required: ["label", "value"],
          properties: {
            label: { type: "string", minLength: 1 },
            value: { type: "string", minLength: 1 },
            comparison: { type: "string", minLength: 1 },
            delta: { type: "string", minLength: 1 },
            unit: { type: "string", minLength: 1 },
            tone: { type: "string", minLength: 1 },
          },
        },
        toneMap: { type: "object", additionalProperties: { enum: METRIC_COMPARISON_SEMANTIC_TOKENS } },
      },
    },
  },
} as const;

type MetricSpec = {
  title?: string;
  emptyText?: string;
  fields: { label: string; value: string; comparison?: string; delta?: string; unit?: string; tone?: string };
  toneMap?: Record<string, MetricToken>;
};

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: tokens.spacingHorizontalM },
  compactGrid: { gridTemplateColumns: "1fr" },
  metric: { display: "grid", gap: tokens.spacingVerticalS, minWidth: 0 },
  compactMetric: { gridTemplateColumns: "minmax(8rem, 1fr) auto auto", alignItems: "center", columnGap: tokens.spacingHorizontalM },
  rankedMetric: { gridTemplateColumns: "2rem minmax(0, 1fr)", alignItems: "center" },
  rank: { color: tokens.colorNeutralForeground3 },
  body: { display: "grid", gap: tokens.spacingVerticalXXS, minWidth: 0 },
  valueRow: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  value: { fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700 },
  compactValue: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500 },
  secondary: { color: tokens.colorNeutralForeground3 },
});

function tokenColor(token: MetricToken): BadgeColor {
  if (token === "positive") return "success";
  if (token === "negative") return "danger";
  if (token === "warning") return "warning";
  return "informative";
}

export const MetricComparison: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const metrics = records(node.props.metrics);
  const spec = (node.props.spec ?? {}) as MetricSpec;
  const variant = (node.props.variant ?? "standard") as MetricComparisonVariant;
  if (!spec.fields || metrics.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No metrics available."}</Text>;

  return <section {...componentRootProps(node, styles.root)} aria-label={spec.title ?? "Metric comparison"}>
    {spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}
    <div className={mergeClasses(styles.grid, variant !== "standard" && styles.compactGrid)}>
      {metrics.map((metric, index) => {
        const toneValue = textAt(metric, spec.fields.tone);
        const token = toneValue ? spec.toneMap?.[toneValue] : undefined;
        const delta = textAt(metric, spec.fields.delta);
        const body = <div className={styles.body}>
          <Text weight="semibold">{textAt(metric, spec.fields.label)}</Text>
          <div className={styles.valueRow}>
            <Text className={variant === "standard" ? styles.value : styles.compactValue} weight="semibold">{textAt(metric, spec.fields.value)}</Text>
            {spec.fields.unit ? <Text className={styles.secondary}>{textAt(metric, spec.fields.unit)}</Text> : null}
          </div>
          {spec.fields.comparison ? <Text className={styles.secondary} size={200}>{textAt(metric, spec.fields.comparison)}</Text> : null}
        </div>;
        return <Card
          key={`${textAt(metric, spec.fields.label)}-${index}`}
          className={mergeClasses(styles.metric, variant === "compact" && styles.compactMetric, variant === "ranked" && styles.rankedMetric)}
          appearance="outline"
        >
          {variant === "ranked" ? <Text className={styles.rank} size={500} weight="semibold">{index + 1}</Text> : null}
          {body}
          {delta ? <Badge appearance={token ? "filled" : "outline"} color={token ? tokenColor(token) : undefined}>{delta}</Badge> : null}
        </Card>;
      })}
    </div>
  </section>;
};

const description: ComponentDescription = {
  capability: "semantic:metric-comparison",
  summary: "Compares a small set of labeled metrics with optional baselines, deltas, units, and semantic tone.",
  dataProp: "metrics",
  events: [],
  semanticTokens: METRIC_COMPARISON_SEMANTIC_TOKENS,
  defaultVariant: "standard",
  variants: [
    { value: "standard", summary: "Responsive metric cards with prominent values.", useWhen: ["Metrics are a primary dashboard result", "Values need strong visual separation"] },
    { value: "compact", summary: "Dense single-column metric rows.", useWhen: ["Horizontal space is constrained", "Metrics support a larger result"] },
    { value: "ranked", summary: "Ordered metric rows with explicit rank numbers.", useWhen: ["Input order communicates priority or performance", "Users compare relative placement"] },
  ],
  authoring: {
    useWhen: ["Several measurements need side-by-side comparison", "A delta or baseline explains current values"],
    avoidWhen: ["A single decision is the focal result; use decision-summary", "Values form a continuous trend; use chart"],
    rules: ["Keep the metric set small enough to scan", "Provide preformatted values and units", "Use input order intentionally for ranked", "Map tone values only to recognized metric tokens"],
  },
};

export function describeMetricComparison() { return description; }
export function getMetricComparisonSchema(): Record<string, unknown> { return metricComparisonPropsSchema as unknown as Record<string, unknown>; }
export function validateMetricComparison(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema: getMetricComparisonSchema(), message: "Invalid semantic:metric-comparison props", code: "semantic-metric-comparison-schema" }], props as Json);
}
export function materializeMetricComparisonTrial() {
  return trialNode("semantic:metric-comparison", {
    variant: "standard",
    metrics: [
      { label: "Affected identities", value: "24", baseline: "7-day average: 9", delta: "+167%", direction: "adverse" },
      { label: "Contained", value: "18", baseline: "75% of affected", delta: "+6 today", direction: "favorable" },
      { label: "Mean response", value: "14", unit: "min", baseline: "Target: 20 min", delta: "-6 min", direction: "favorable" },
    ],
    spec: { title: "Incident metrics", fields: { label: "label", value: "value", comparison: "baseline", delta: "delta", unit: "unit", tone: "direction" }, toneMap: { adverse: "negative", favorable: "positive" } },
  });
}
export const metricComparisonDefinition: DeclarativeComponentDefinition = {
  capability: description.capability,
  version: "1.0.0",
  summary: description.summary,
  dataProp: description.dataProp,
  events: description.events,
  semanticTokens: description.semanticTokens,
  defaultVariant: description.defaultVariant,
  variants: description.variants,
  authoring: description.authoring,
  component: MetricComparison,
  describe: describeMetricComparison,
  getSchema: getMetricComparisonSchema,
  validate: validateMetricComparison,
  materializeTrial: materializeMetricComparisonTrial,
};