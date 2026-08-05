import { Toolbar, type ToolbarProps } from "@fluentui/react-components";
import { readProps, type ProjectionView } from "@gik/react";

import type { ComponentDescription } from "../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared/component";
import { defineFluentComponent } from "./defineFluentComponent";

const toolbarSizes = ["small", "medium", "large"] as const;

export const FluentToolbar: ProjectionView = ({ node, children }) => {
  const props = readProps(node);
  return (
    <Toolbar
      {...componentRootProps(node)}
      aria-label={props.str("ariaLabel") || undefined}
      size={props.str("size") as ToolbarProps["size"] || undefined}
      vertical={props.bool("vertical")}
    >
      {children}
    </Toolbar>
  );
};

const toolbarSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    ariaLabel: { type: "string" },
    size: { type: "string", enum: toolbarSizes },
    vertical: { type: "boolean" },
  },
} as const);

const toolbarDescription: ComponentDescription = {
  capability: "fluent:toolbar",
  summary: "Renders a Fluent 2 toolbar that groups related commands and controls.",
  slots: ["children"],
  events: [],
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: ["Related commands and controls act on the same work surface"],
    avoidWhen: ["Children are general page content rather than commands or controls"],
    rules: ["Provide ariaLabel", "Keep command and control groups concise"],
  },
};

export const fluentToolbarDefinition = defineFluentComponent(toolbarDescription, toolbarSchema, FluentToolbar, {
  ariaLabel: "Incident report controls",
});