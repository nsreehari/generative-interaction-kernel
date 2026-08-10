import React from "react";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import { componentRootProps, componentStylePropsSchema } from "../../shared/component";
import { defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

const useStyles = makeStyles({
  root: { margin: 0, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase300 },
  info: { color: tokens.colorBrandForeground1 },
  warning: { color: tokens.colorPaletteDarkOrangeForeground2 },
  danger: { color: tokens.colorPaletteRedForeground1 },
  success: { color: tokens.colorPaletteGreenForeground1 },
});

export const Note: ProjectionView = ({ node }) => {
  const styles = useStyles();
  const props = readProps(node);
  const tone = props.str("tone", "muted");
  const toneClass = tone === "info" ? styles.info : tone === "warning" ? styles.warning : tone === "danger" ? styles.danger : tone === "success" ? styles.success : undefined;
  return <p {...componentRootProps(node, mergeClasses(styles.root, toneClass))}>{props.str("value")}</p>;
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["value"],
  properties: { ...componentStylePropsSchema, value: { type: "string" }, tone: { type: "string", enum: ["muted", "info", "warning", "danger", "success"] } },
} as const;
const description: ComponentDescription = {
  capability: "primitive:note",
  summary: "Presents a short, non-interactive status or supporting note with an optional semantic tone.",
  dataProp: "value",
  events: [],
  semanticTokens: ["muted", "info", "warning", "danger", "success"],
  variants: [],
  authoring: {
    useWhen: ["Short supporting or status copy needs visual emphasis without interaction"],
    avoidWhen: ["Content contains document structure; use primitive:markdown", "The message requires dismissal or an action"],
    rules: ["Bind text through value", "Use tone only for semantic status"],
  },
};
export function validateNote(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema, message: "Invalid primitive:note props", code: "primitive-note-schema" }], props as Json);
}
export const noteDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: Note,
  getSchema: () => schema,
  validate: validateNote,
  materializeTrial: () => trialNode("primitive:note", { value: "Refinement complete.", tone: "success" }),
});