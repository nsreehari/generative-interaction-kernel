import React from "react";
import { Badge, Card, Text, makeStyles, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema, records, textAt, type BadgeColor, type DataRecord } from "../../shared/component";
import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

export const MEASURE_SET_SEMANTIC_TOKENS = ["positive", "negative", "warning", "neutral", "unknown"] as const;
export const MEASURE_SET_VARIANTS = ["tiles", "table", "ranking", "text"] as const;
type MeasureToken = typeof MEASURE_SET_SEMANTIC_TOKENS[number];
type MeasureSetVariant = typeof MEASURE_SET_VARIANTS[number];

interface MeasureSetSpec {
  title?: string;
  emptyText?: string;
  density?: "comfortable" | "compact";
  fields: { id: string; label: string; value: string; unit?: string; baseline?: string; delta?: string; order?: string; tone?: string };
  toneMap?: Record<string, MeasureToken>;
}

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["measures", "spec"],
  properties: {
    ...componentStylePropsSchema,
    measures: { type: "array", items: { type: "object" } },
    variant: { enum: MEASURE_SET_VARIANTS },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["fields"],
      properties: {
        title: { type: "string" },
        emptyText: { type: "string" },
        density: { enum: ["comfortable", "compact"] },
        fields: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label", "value"],
          properties: {
            id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, value: { type: "string", minLength: 1 },
            unit: { type: "string", minLength: 1 }, baseline: { type: "string", minLength: 1 }, delta: { type: "string", minLength: 1 },
            order: { type: "string", minLength: 1 }, tone: { type: "string", minLength: 1 },
          },
        },
        toneMap: { type: "object", additionalProperties: { enum: MEASURE_SET_SEMANTIC_TOKENS } },
      },
    },
  },
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0 },
  tiles: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))", gap: tokens.spacingHorizontalM },
  tile: { display: "grid", gap: tokens.spacingVerticalS, minWidth: 0 },
  valueRow: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  value: { fontSize: tokens.fontSizeHero700, lineHeight: tokens.lineHeightHero700 },
  compactValue: { fontSize: tokens.fontSizeBase500, lineHeight: tokens.lineHeightBase500 },
  secondary: { color: tokens.colorNeutralForeground3 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  cell: { padding: tokens.spacingVerticalS, textAlign: "left", borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  ranking: { display: "grid", gap: tokens.spacingVerticalS, margin: 0, padding: 0, listStyle: "none" },
  rankRow: { display: "grid", gridTemplateColumns: "2rem minmax(0, 1fr) auto", alignItems: "center", gap: tokens.spacingHorizontalM },
  rankBody: { display: "grid", gap: tokens.spacingVerticalXXS },
  rankValue: { display: "grid", gap: tokens.spacingVerticalXXS, textAlign: "right" },
  rank: { color: tokens.colorNeutralForeground3 },
  text: { display: "grid", gap: tokens.spacingVerticalXS },
});

function color(token: MeasureToken | undefined): BadgeColor | undefined {
  if (token === "positive") return "success";
  if (token === "negative") return "danger";
  if (token === "warning") return "warning";
  return token ? "informative" : undefined;
}

function orderedMeasures(measures: DataRecord[], orderField?: string) {
  return orderField ? [...measures].sort((left, right) => Number(textAt(left, orderField)) - Number(textAt(right, orderField))) : measures;
}

function formattedValue(measure: DataRecord, spec: MeasureSetSpec) {
  return `${textAt(measure, spec.fields.value)}${spec.fields.unit && textAt(measure, spec.fields.unit) ? ` ${textAt(measure, spec.fields.unit)}` : ""}`;
}

export const MeasureSet: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const measures = records(node.props.measures);
  const spec = (node.props.spec ?? {}) as unknown as MeasureSetSpec;
  const variant = (node.props.variant ?? "tiles") as MeasureSetVariant;
  if (!spec.fields || measures.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No measures available."}</Text>;
  const ordered = orderedMeasures(measures, spec.fields.order);
  const root = componentRootProps(node, styles.root);

  const title = spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null;
  if (variant === "text") return <section {...root}>{title}<div className={styles.text}>{ordered.map((measure) => <Text key={textAt(measure, spec.fields.id)}>{textAt(measure, spec.fields.label)}: {formattedValue(measure, spec)}{spec.fields.baseline && textAt(measure, spec.fields.baseline) ? ` (${textAt(measure, spec.fields.baseline)})` : ""}{spec.fields.delta && textAt(measure, spec.fields.delta) ? `, ${textAt(measure, spec.fields.delta)}` : ""}</Text>)}</div></section>;

  if (variant === "table") return <section {...root}>{title}<div className={styles.tableWrap}><table className={styles.table}><thead><tr><th className={styles.cell}>Measure</th><th className={styles.cell}>Value</th><th className={styles.cell}>Baseline</th><th className={styles.cell}>Delta</th></tr></thead><tbody>{ordered.map((measure) => <tr key={textAt(measure, spec.fields.id)}><td className={styles.cell}>{textAt(measure, spec.fields.label)}</td><td className={styles.cell}>{formattedValue(measure, spec)}</td><td className={styles.cell}>{textAt(measure, spec.fields.baseline)}</td><td className={styles.cell}>{textAt(measure, spec.fields.delta)}</td></tr>)}</tbody></table></div></section>;

  if (variant === "ranking") return <section {...root}>{title}<ol className={styles.ranking}>{ordered.map((measure, index) => <li className={styles.rankRow} key={textAt(measure, spec.fields.id)}><Text className={styles.rank} size={500} weight="semibold">{index + 1}</Text><div className={styles.rankBody}><Text weight="semibold">{textAt(measure, spec.fields.label)}</Text>{spec.fields.baseline ? <Text className={styles.secondary} size={200}>{textAt(measure, spec.fields.baseline)}</Text> : null}</div><div className={styles.rankValue}><Text>{formattedValue(measure, spec)}</Text>{spec.fields.delta ? <Text className={styles.secondary} size={200}>{textAt(measure, spec.fields.delta)}</Text> : null}</div></li>)}</ol></section>;

  return <section {...root}>{title}<div className={styles.tiles}>{ordered.map((measure) => {
    const toneValue = textAt(measure, spec.fields.tone);
    const token = toneValue ? spec.toneMap?.[toneValue] : undefined;
    const delta = textAt(measure, spec.fields.delta);
    return <Card className={styles.tile} appearance="outline" key={textAt(measure, spec.fields.id)}><Text weight="semibold">{textAt(measure, spec.fields.label)}</Text><div className={styles.valueRow}><Text className={spec.density === "compact" ? styles.compactValue : styles.value} weight="semibold">{textAt(measure, spec.fields.value)}</Text>{spec.fields.unit ? <Text className={styles.secondary}>{textAt(measure, spec.fields.unit)}</Text> : null}</div>{spec.fields.baseline ? <Text className={styles.secondary} size={200}>{textAt(measure, spec.fields.baseline)}</Text> : null}{delta ? <Badge appearance={token ? "filled" : "outline"} color={color(token)}>{delta}</Badge> : null}</Card>;
  })}</div></section>;
};

const description: ComponentDescription = {
  capability: "semantic:measure-set", summary: "Presents a related set of authored measurements without changing their meaning or order.", dataProp: "measures", events: [], semanticTokens: MEASURE_SET_SEMANTIC_TOKENS, defaultVariant: "tiles",
  variants: [
    { value: "tiles", summary: "Prominent measure tiles for rapid scanning.", useWhen: ["A small measure set is a primary result"] },
    { value: "table", summary: "Aligned values, baselines, and deltas.", useWhen: ["Exact cross-measure comparison matters"] },
    { value: "ranking", summary: "Authored measure order with explicit ordinal positions.", useWhen: ["The supplied order communicates rank"] },
    { value: "text", summary: "Complete textual measure projection.", useWhen: ["Visual layout is unavailable or inappropriate"] },
  ],
  authoring: { useWhen: ["Several measurements form one comparison set"], avoidWhen: ["Values form a continuous trend; use chart"], rules: ["All variants consume the same measures", "Ranking uses authored order and never infers importance", "Put density in spec"] },
};

export function getMeasureSetSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateMeasureSet(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema: getMeasureSetSchema(), message: "Invalid semantic:measure-set props", code: "measure-set-schema" }], props as Json); }
export function materializeMeasureSetTrial() { return trialNode("semantic:measure-set", { variant: "tiles", measures: [{ id: "affected", label: "Affected identities", value: "24", baseline: "7-day average: 9", delta: "+167%", order: 1, direction: "adverse" }, { id: "contained", label: "Contained", value: "18", baseline: "75% of affected", delta: "+6 today", order: 2, direction: "favorable" }, { id: "response", label: "Mean response", value: "14", unit: "min", baseline: "Target: 20 min", delta: "-6 min", order: 3, direction: "favorable" }], spec: { title: "Incident measures", density: "comfortable", fields: { id: "id", label: "label", value: "value", unit: "unit", baseline: "baseline", delta: "delta", order: "order", tone: "direction" }, toneMap: { adverse: "negative", favorable: "positive" } } }); }
export const measureSetDefinition = defineComponent({ description, version: "1.0.0", component: MeasureSet, getSchema: getMeasureSetSchema, validate: validateMeasureSet, materializeTrial: materializeMeasureSetTrial });