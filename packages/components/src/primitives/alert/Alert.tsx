import React from "react";
import { MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema } from "../../shared/component";
import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

const levels = ["good", "success", "warn", "warning", "bad", "error", "info", "unknown"] as const;

export const Alert: ProjectionView = ({ node }) => {
  const props = readProps(node);
  const level = props.str("level", "unknown");
  const intent = level === "good" || level === "success" ? "success" : level === "warn" || level === "warning" ? "warning" : level === "bad" || level === "error" ? "error" : "info";
  return <MessageBar {...componentRootProps(node)} intent={intent}><MessageBarBody>{props.str("label") ? <MessageBarTitle>{props.str("label")}</MessageBarTitle> : null}{props.str("value") || "-"}</MessageBarBody></MessageBar>;
};

const schema = { type: "object", additionalProperties: false, required: ["value"], properties: { ...componentStylePropsSchema, value: { type: "string" }, label: { type: "string" }, level: { type: "string", enum: levels } } } as const;
const description: ComponentDescription = { capability: "primitive:alert", summary: "Presents a labeled status message using Fluent semantic intent.", dataProp: "value", events: [], semanticTokens: [...levels], variants: [], authoring: { useWhen: ["A status or failure needs prominent non-interactive feedback"], avoidWhen: ["The message is ordinary supporting copy; use primitive:note"], rules: ["Bind message text through value", "Use level only for semantic status"] } };
export function validateAlert(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid primitive:alert props", code: "primitive-alert-schema" }], props as Json); }
export const alertDefinition = defineComponent({ description, version: "1.0.0", component: Alert, getSchema: () => schema, validate: validateAlert, materializeTrial: () => trialNode("primitive:alert", { label: "Status", value: "Investigation active", level: "info" }) });