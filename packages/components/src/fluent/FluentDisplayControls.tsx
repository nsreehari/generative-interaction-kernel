import {
  Badge,
  Persona,
  Spinner,
  type BadgeProps,
  type PersonaProps,
  type SpinnerProps,
} from "@fluentui/react-components";
import { readProps, type ProjectionView } from "@gik/react";

import type { ComponentDescription } from "../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared/component";
import { defineFluentComponent } from "./defineFluentComponent";
import { STANDARD_COMPACT_VARIANTS } from "./fluentVariants";

const badgeAppearances = ["filled", "ghost", "outline", "tint"] as const;
const badgeColors = ["brand", "danger", "important", "informative", "severe", "subtle", "success", "warning"] as const;
const badgeShapes = ["circular", "rounded", "square"] as const;
const badgeSizes = ["tiny", "extra-small", "small", "medium", "large"] as const;
const personaSizes = ["extra-small", "small", "medium", "large", "huge"] as const;
const personaTextAlignments = ["center", "start"] as const;
const spinnerAppearances = ["primary", "inverted"] as const;
const spinnerLabelPositions = ["above", "below", "before", "after"] as const;
const spinnerSizes = ["tiny", "extra-small", "small", "medium", "large", "huge"] as const;

export const FluentBadge: ProjectionView = ({ node }) => {
  const props = readProps(node);
  const size = props.str("size") as BadgeProps["size"];
  return (
    <Badge
      {...componentRootProps(node)}
      appearance={props.str("appearance") as BadgeProps["appearance"] || undefined}
      color={props.str("color") as BadgeProps["color"] || undefined}
      shape={props.str("shape") as BadgeProps["shape"] || undefined}
      size={size || (node.props.variant === "compact" ? "small" : undefined)}
    >
      {props.str("label")}
    </Badge>
  );
};

export const FluentPersona: ProjectionView = ({ node }) => {
  const props = readProps(node);
  const size = props.str("size") as PersonaProps["size"];
  return (
    <Persona
      {...componentRootProps(node)}
      name={props.str("name")}
      presenceOnly={props.bool("presenceOnly")}
      secondaryText={props.str("secondaryText") || undefined}
      size={size || (node.props.variant === "compact" ? "small" : undefined)}
      tertiaryText={props.str("tertiaryText") || undefined}
      textAlignment={props.str("textAlignment") as PersonaProps["textAlignment"] || undefined}
    />
  );
};

export const FluentSpinner: ProjectionView = ({ node }) => {
  const props = readProps(node);
  const size = props.str("size") as SpinnerProps["size"];
  return (
    <Spinner
      {...componentRootProps(node)}
      appearance={props.str("appearance") as SpinnerProps["appearance"] || undefined}
      label={props.str("label") || undefined}
      labelPosition={props.str("labelPosition") as SpinnerProps["labelPosition"] || undefined}
      size={size || (node.props.variant === "compact" ? "small" : undefined)}
    />
  );
};

const stringProperty = { type: "string" } as const;
const badgeSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  required: ["label"],
  properties: {
    label: stringProperty,
    appearance: { type: "string", enum: badgeAppearances },
    color: { type: "string", enum: badgeColors },
    shape: { type: "string", enum: badgeShapes },
    size: { type: "string", enum: badgeSizes },
  },
} as const);
const personaSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: stringProperty,
    presenceOnly: { type: "boolean" },
    secondaryText: stringProperty,
    tertiaryText: stringProperty,
    size: { type: "string", enum: personaSizes },
    textAlignment: { type: "string", enum: personaTextAlignments },
  },
} as const);
const spinnerSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    appearance: { type: "string", enum: spinnerAppearances },
    label: stringProperty,
    labelPosition: { type: "string", enum: spinnerLabelPositions },
    size: { type: "string", enum: spinnerSizes },
  },
} as const);

function displayDescription(
  capability: string,
  summary: string,
  useWhen: string,
  avoidWhen: string,
  rules: string[],
): ComponentDescription {
  return {
    capability,
    summary,
    events: [],
    semanticTokens: [],
    defaultVariant: "standard",
    variants: STANDARD_COMPACT_VARIANTS,
    authoring: { useWhen: [useWhen], avoidWhen: [avoidWhen], rules },
  };
}

const badgeDescription = displayDescription(
  "fluent:badge",
  "Renders a Fluent 2 badge for a short status or count label.",
  "A compact label communicates status, category, or count",
  "The value needs explanatory prose or interaction",
  ["Keep the label short", "Use only native Fluent appearance, color, shape, and size values"],
);
const personaDescription = displayDescription(
  "fluent:persona",
  "Renders a Fluent 2 persona with identity and supporting text.",
  "A person or identity needs a recognizable summary",
  "The content does not represent a person or identity",
  ["Provide the display name", "Use supporting text only for identity-relevant details"],
);
const spinnerDescription = displayDescription(
  "fluent:spinner",
  "Renders a Fluent 2 indeterminate progress spinner.",
  "An operation is in progress and its completion percentage is unknown",
  "Progress is determinate or no operation is active",
  ["Provide a label when surrounding context does not explain the operation", "Remove the spinner when the operation completes"],
);

export const fluentBadgeDefinition = defineFluentComponent(badgeDescription, badgeSchema, FluentBadge, {
  label: "Active",
  color: "success",
});
export const fluentPersonaDefinition = defineFluentComponent(personaDescription, personaSchema, FluentPersona, {
  name: "Ada Lovelace",
  secondaryText: "Incident commander",
});
export const fluentSpinnerDefinition = defineFluentComponent(spinnerDescription, spinnerSchema, FluentSpinner, {
  label: "Loading incident data",
});