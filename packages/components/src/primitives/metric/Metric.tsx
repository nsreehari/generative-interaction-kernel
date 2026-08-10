import React from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema } from "../../shared/component";
import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

const useStyles = makeStyles({ root: { minWidth: 0, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS }, label: { color: tokens.colorNeutralForeground3 }, value: { overflowWrap: "anywhere" } });
export const Metric: ProjectionView = ({ node }) => { const styles = useStyles(); const props = readProps(node); return <div {...componentRootProps(node, styles.root)}><Text className={styles.label} size={200}>{props.str("label")}</Text><Text className={styles.value} size={500} weight="semibold">{props.str("value")}</Text></div>; };
const schema = { type: "object", additionalProperties: false, required: ["label", "value"], properties: { ...componentStylePropsSchema, label: { type: "string" }, value: { type: ["string", "number"] } } } as const;
const description: ComponentDescription = { capability: "primitive:metric", summary: "Presents one labeled scalar measure.", dataProp: "value", events: [], semanticTokens: [], variants: [], authoring: { useWhen: ["One scalar deserves compact visual prominence"], avoidWhen: ["Several related measures should be compared; use semantic:measure-set"], rules: ["Provide a concise label", "Bind the scalar through value"] } };
export function validateMetric(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid primitive:metric props", code: "primitive-metric-schema" }], props as Json); }
export const metricDefinition = defineComponent({ description, version: "1.0.0", component: Metric, getSchema: () => schema, validate: validateMetric, materializeTrial: () => trialNode("primitive:metric", { label: "Coverage", value: "94%" }) });