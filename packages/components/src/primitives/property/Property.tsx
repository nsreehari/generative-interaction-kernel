import React from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema } from "../../shared/component";
import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

const useStyles = makeStyles({ root: { minWidth: 0, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS }, label: { color: tokens.colorNeutralForeground3, textTransform: "uppercase" }, value: { overflowWrap: "anywhere" } });
export const Property: ProjectionView = ({ node }) => { const styles = useStyles(); const props = readProps(node); return <div {...componentRootProps(node, styles.root)}><Text className={styles.label} size={100}>{props.str("label")}</Text><Text className={styles.value} size={300} weight="semibold">{props.str("value")}</Text></div>; };
const schema = { type: "object", additionalProperties: false, required: ["label", "value"], properties: { ...componentStylePropsSchema, label: { type: "string" }, value: { type: ["string", "number", "boolean"] } } } as const;
const description: ComponentDescription = { capability: "primitive:property", summary: "Presents one compact labeled attribute.", dataProp: "value", events: [], semanticTokens: [], variants: [], authoring: { useWhen: ["An identifier, enum, count, or short phrase needs a visible label"], avoidWhen: ["The value is a prominent measure; use primitive:metric"], rules: ["Keep values concise", "Bind the attribute through value"] } };
export function validateProperty(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid primitive:property props", code: "primitive-property-schema" }], props as Json); }
export const propertyDefinition = defineComponent({ description, version: "1.0.0", component: Property, getSchema: () => schema, validate: validateProperty, materializeTrial: () => trialNode("primitive:property", { label: "Version", value: "1.0.0" }) });