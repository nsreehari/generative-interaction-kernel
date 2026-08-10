import React from "react";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { readProps, type ProjectionView } from "@gik/react";

import { componentRootProps, withComponentStylePropsSchema } from "../shared/component";
import { type ComponentDescription } from "../shared/definition";
import { defineFluentComponent } from "./defineFluentComponent";

const useStyles = makeStyles({
  row: { minWidth: 0, display: "flex", alignItems: "center", gap: tokens.spacingHorizontalM },
  wrap: { flexWrap: "wrap" },
  between: { justifyContent: "space-between" },
  panel: { minWidth: 0, padding: tokens.spacingHorizontalL, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1 },
  subtle: { backgroundColor: tokens.colorNeutralBackground2 },
  title: { margin: `0 0 ${tokens.spacingVerticalM}`, fontSize: tokens.fontSizeBase400, lineHeight: tokens.lineHeightBase400, fontWeight: tokens.fontWeightSemibold },
});

export const FluentRow: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const props = readProps(node);
  const variant = props.str("variant", "default");
  const gap = props.str("spacing");
  return <div {...componentRootProps(node, mergeClasses(styles.row, variant === "wrap" ? styles.wrap : undefined, variant === "between" ? styles.between : undefined))} style={{ ...node.props.style as React.CSSProperties, ...(gap ? { gap } : {}) }}>{children}</div>;
};

export const FluentPanel: ProjectionView = ({ node, children }) => {
  const styles = useStyles();
  const props = readProps(node);
  const title = props.str("title");
  return <section {...componentRootProps(node, mergeClasses(styles.panel, props.str("variant") === "subtle" ? styles.subtle : undefined))}>{title ? <h2 className={styles.title}>{title}</h2> : null}{children}</section>;
};

const rowSchema = withComponentStylePropsSchema({ type: "object", additionalProperties: false, properties: { variant: { type: "string" }, spacing: { type: "string" } } } as const);
const panelSchema = withComponentStylePropsSchema({ type: "object", additionalProperties: false, properties: { title: { type: "string" }, variant: { type: "string" } } } as const);
const rowDescription: ComponentDescription = { capability: "fluent:row", summary: "Arranges authored children in a horizontal Fluent layout.", slots: ["children"], events: [], semanticTokens: [], defaultVariant: "default", variants: [{ value: "default", summary: "Uses a standard horizontal layout.", useWhen: ["Children fit on one line"] }, { value: "wrap", summary: "Wraps children onto additional lines.", useWhen: ["Children may exceed available width"] }, { value: "between", summary: "Distributes children across the available width.", useWhen: ["Leading and trailing groups share a row"] }], authoring: { useWhen: ["Peer controls belong on one horizontal line"], avoidWhen: ["Children form a vertical document flow"], rules: ["Use wrap when content may exceed the available width"] } };
const panelDescription: ComponentDescription = { capability: "fluent:panel", summary: "Groups authored children in a titled Fluent surface.", slots: ["children"], events: [], semanticTokens: [], defaultVariant: "default", variants: [{ value: "default", summary: "Uses the standard Fluent surface.", useWhen: ["A bounded content group is required"] }, { value: "subtle", summary: "Uses a quieter neutral surface.", useWhen: ["The group is secondary to nearby content"] }], authoring: { useWhen: ["Related controls or content need a bounded group"], avoidWhen: ["The group does not need a visual boundary"], rules: ["Use a concise title", "Do not nest panels solely for spacing"] } };
export const fluentRowDefinition = defineFluentComponent(rowDescription, rowSchema, FluentRow, {});
export const fluentPanelDefinition = defineFluentComponent(panelDescription, panelSchema, FluentPanel, { title: "Details" });
