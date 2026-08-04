import React from "react";
import { Button, Spinner, type ButtonProps } from "@fluentui/react-components";
import {
  EditRegular,
  FullScreenMaximizeRegular,
  FullScreenMinimizeRegular,
} from "@fluentui/react-icons";
import { readProps, type ProjectionView } from "@gik/react";

import { eventContract, type ComponentDescription } from "../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared/component";
import { defineFluentComponent } from "./defineFluentComponent";

const appearances = ["primary", "secondary", "subtle", "transparent", "outline"] as const;
const shapes = ["rounded", "circular", "square"] as const;
const sizes = ["small", "medium", "large"] as const;
type FluentButtonAppearance = Extract<ButtonProps["appearance"], typeof appearances[number]>;
type FluentButtonShape = Extract<ButtonProps["shape"], typeof shapes[number]>;
type FluentButtonSize = Extract<ButtonProps["size"], typeof sizes[number]>;

const BUTTON_VARIANTS = [
  { value: "action", summary: "Uses Fluent's standard labeled action presentation.", useWhen: ["A normal labeled command is needed"] },
  { value: "primary", summary: "Uses Fluent's primary appearance.", useWhen: ["The command is the primary action in its region"] },
  { value: "subtle", summary: "Uses Fluent's subtle appearance.", useWhen: ["The command should remain visually quiet"] },
  { value: "icon", summary: "Renders an icon-only Fluent button.", useWhen: ["A familiar icon has a complete accessible name"] },
  { value: "circular", summary: "Renders an icon-only circular Fluent button.", useWhen: ["A compact circular command is appropriate"] },
  { value: "floating", summary: "Renders a large primary circular icon button; its container owns positioning.", useWhen: ["A prominent floating-style command is needed"] },
  { value: "inline", summary: "Uses Fluent's transparent small button presentation.", useWhen: ["An action appears inline with text or dense content"] },
] as const;

export const FluentButton: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const [emitting, setEmitting] = React.useState(false);
  const loading = props.bool("loading") || emitting;
  const variant = props.str("variant", "action");
  const appearance = props.str("appearance") as FluentButtonAppearance;
  const shape = props.str("shape") as FluentButtonShape;
  const size = props.str("size") as FluentButtonSize;
  const iconName = props.str("icon") as keyof typeof icons;
  const iconOnly = variant === "icon" || variant === "circular" || variant === "floating";
  const preset: Partial<Pick<ButtonProps, "appearance" | "shape" | "size">> =
    variant === "primary" ? { appearance: "primary" }
      : variant === "subtle" ? { appearance: "subtle" }
        : variant === "circular" ? { shape: "circular" }
          : variant === "floating" ? { appearance: "primary", shape: "circular", size: "large" }
            : variant === "inline" ? { appearance: "transparent", size: "small" }
              : {};
  return (
    <Button
      {...componentRootProps(node)}
      appearance={appearance || preset.appearance}
      shape={shape || preset.shape}
      size={size || preset.size}
      icon={loading ? <Spinner size="tiny" /> : icons[iconName]}
      disabled={props.bool("disabled")}
      aria-label={props.str("ariaLabel") || undefined}
      onClick={async () => {
        setEmitting(true);
        try {
          await emit("press", {});
        } finally {
          setEmitting(false);
        }
      }}
    >
      {iconOnly ? null : props.str("label")}
    </Button>
  );
};

const icons = {
  edit: <EditRegular />,
  "full-screen-maximize": <FullScreenMaximizeRegular />,
  "full-screen-minimize": <FullScreenMinimizeRegular />,
} as const;

const buttonSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    icon: { type: "string", enum: Object.keys(icons) },
    appearance: { type: "string", enum: appearances },
    ariaLabel: { type: "string" },
    disabled: { type: "boolean" },
    loading: { type: "boolean" },
    shape: { type: "string", enum: shapes },
    size: { type: "string", enum: sizes },
  },
  anyOf: [
    { required: ["label"] },
    { required: ["icon", "ariaLabel"] },
  ],
} as const);

const buttonDescription: ComponentDescription = {
  capability: "fluent:button",
  summary: "Renders a Fluent 2 action or icon button through closed native variants.",
  events: ["press"],
  eventContracts: { press: eventContract("The user invokes the button.") },
  semanticTokens: [],
  defaultVariant: "action",
  variants: BUTTON_VARIANTS,
  authoring: {
    useWhen: ["A user invokes a command through a label or familiar icon"],
    avoidWhen: ["The interaction is a persistent binary state; use switch or toggle"],
    rules: ["Use a concise label for labeled variants", "Always provide ariaLabel for icon-only variants", "Handle press outside the component"],
  },
};

export const fluentButtonDefinition = defineFluentComponent(
  buttonDescription,
  buttonSchema,
  FluentButton,
  { label: "Analyze report", appearance: "primary" },
);
