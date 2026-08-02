import React from "react";
import { Button, type ButtonProps } from "@fluentui/react-components";
import {
  EditRegular,
  FullScreenMaximizeRegular,
  FullScreenMinimizeRegular,
} from "@fluentui/react-icons";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import {
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
  type DeclarativeComponentDefinition,
} from "../definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared";

const appearances = ["primary", "secondary", "subtle", "transparent", "outline"] as const;
type FluentButtonAppearance = Extract<ButtonProps["appearance"], typeof appearances[number]>;

export const FluentButton: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const appearance = props.str("appearance") as FluentButtonAppearance;
  return (
    <Button
      {...componentRootProps(node, "gx-fluent-button")}
      appearance={appearance || "secondary"}
      disabled={props.bool("disabled")}
      aria-label={props.str("ariaLabel") || undefined}
      onClick={() => void emit("press", {})}
    >
      {props.str("label")}
    </Button>
  );
};

const icons = {
  edit: <EditRegular />,
  "full-screen-maximize": <FullScreenMaximizeRegular />,
  "full-screen-minimize": <FullScreenMinimizeRegular />,
} as const;

export const FluentIconButton: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const iconName = props.str("icon") as keyof typeof icons;
  const ariaLabel = props.str("ariaLabel");
  return (
    <Button
      {...componentRootProps(node, "gx-fluent-icon-button")}
      appearance="subtle"
      shape="circular"
      size="small"
      icon={icons[iconName] ?? icons["full-screen-maximize"]}
      disabled={props.bool("disabled")}
      aria-label={ariaLabel}
      title={props.str("title", ariaLabel)}
      onClick={() => void emit("press", {})}
    />
  );
};

const buttonSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    appearance: { type: "string", enum: appearances },
    ariaLabel: { type: "string" },
    disabled: { type: "boolean" },
  },
  required: ["label"],
} as const);

const iconButtonSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    icon: { type: "string", enum: Object.keys(icons) },
    ariaLabel: { type: "string", minLength: 1 },
    title: { type: "string" },
    disabled: { type: "boolean" },
  },
  required: ["icon", "ariaLabel"],
} as const);

const buttonDescription: ComponentDescription = {
  capability: "fluent:button",
  summary: "Renders a labeled Fluent 2 command button.",
  events: ["press"],
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: ["A user invokes a clearly labeled command"],
    avoidWhen: ["The command is represented by a familiar icon with an accessible name"],
    rules: ["Use a concise action label", "Handle press outside the component"],
  },
};

const iconButtonDescription: ComponentDescription = {
  capability: "fluent:icon-button",
  summary: "Renders a compact Fluent 2 icon-only command with an accessible name.",
  events: ["press"],
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: ["A compact command has a familiar icon and an accessible name"],
    avoidWhen: ["The action needs a visible text label for clarity"],
    rules: ["Always provide ariaLabel", "Select only a declared icon", "Handle press outside the component"],
  },
};

function validate(schema: Record<string, unknown>, capability: string, props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema,
    message: `Invalid ${capability} props`,
    code: `${capability.replace(":", "-")}-schema`,
  }], props as Json);
}

export const fluentButtonDefinition: DeclarativeComponentDefinition = {
  capability: buttonDescription.capability,
  version: "1.0.0",
  summary: buttonDescription.summary,
  events: buttonDescription.events,
  semanticTokens: buttonDescription.semanticTokens,
  variants: buttonDescription.variants,
  authoring: buttonDescription.authoring,
  component: FluentButton,
  describe: () => buttonDescription,
  getSchema: () => buttonSchema,
  validate: (props) => validate(buttonSchema, buttonDescription.capability, props),
  materializeTrial: () => trialNode(buttonDescription.capability, { label: "Analyze report", appearance: "primary" }),
};

export const fluentIconButtonDefinition: DeclarativeComponentDefinition = {
  capability: iconButtonDescription.capability,
  version: "1.0.0",
  summary: iconButtonDescription.summary,
  events: iconButtonDescription.events,
  semanticTokens: iconButtonDescription.semanticTokens,
  variants: iconButtonDescription.variants,
  authoring: iconButtonDescription.authoring,
  component: FluentIconButton,
  describe: () => iconButtonDescription,
  getSchema: () => iconButtonSchema,
  validate: (props) => validate(iconButtonSchema, iconButtonDescription.capability, props),
  materializeTrial: () => trialNode(iconButtonDescription.capability, {
    icon: "full-screen-maximize",
    ariaLabel: "Enter full screen",
  }),
};
