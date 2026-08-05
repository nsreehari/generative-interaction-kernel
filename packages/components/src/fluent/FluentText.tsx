import { Text, type TextProps } from "@fluentui/react-components";
import { readProps, type ProjectionView } from "@gik/react";

import type { ComponentDescription } from "../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared/component";
import { defineFluentComponent } from "./defineFluentComponent";

export const FLUENT_TEXT_VARIANTS = ["body", "caption", "subtitle", "title", "display"] as const;
export const FLUENT_TEXT_ELEMENTS = ["span", "p", "div", "label", "h1", "h2", "h3", "h4", "h5", "h6"] as const;

const variantProps: Record<typeof FLUENT_TEXT_VARIANTS[number], Pick<TextProps, "size" | "weight">> = {
  body: { size: 300, weight: "regular" },
  caption: { size: 200, weight: "regular" },
  subtitle: { size: 400, weight: "semibold" },
  title: { size: 500, weight: "semibold" },
  display: { size: 700, weight: "bold" },
};

export const FluentText: ProjectionView = ({ node }) => {
  const props = readProps(node);
  const variant = FLUENT_TEXT_VARIANTS.includes(node.props.variant as typeof FLUENT_TEXT_VARIANTS[number])
    ? node.props.variant as typeof FLUENT_TEXT_VARIANTS[number]
    : "body";
  const element = props.str("as");
  const as = FLUENT_TEXT_ELEMENTS.includes(element as typeof FLUENT_TEXT_ELEMENTS[number])
    ? element as typeof FLUENT_TEXT_ELEMENTS[number]
    : "span";
  const content = props.str("value");
  const typographyProps = {
    ...variantProps[variant],
    align: props.str("align") as TextProps["align"] || undefined,
    block: props.bool("block"),
    italic: props.bool("italic"),
    truncate: props.bool("truncate"),
    underline: props.bool("underline"),
    wrap: props.bool("wrap"),
  };
  if (as === "label") {
    return <label {...componentRootProps(node)} htmlFor={props.str("htmlFor") || undefined}><Text {...typographyProps}>{content}</Text></label>;
  }
  if (as === "div") {
    return <div {...componentRootProps(node)}><Text {...typographyProps}>{content}</Text></div>;
  }
  return (
    <Text
      {...componentRootProps(node)}
      {...typographyProps}
      as={as as TextProps["as"]}
    >
      {content}
    </Text>
  );
};

const schema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  required: ["value"],
  properties: {
    value: { type: "string" },
    as: { type: "string", enum: FLUENT_TEXT_ELEMENTS },
    htmlFor: { type: "string", minLength: 1 },
    align: { type: "string", enum: ["start", "center", "end", "justify"] },
    block: { type: "boolean" },
    italic: { type: "boolean" },
    truncate: { type: "boolean" },
    underline: { type: "boolean" },
    wrap: { type: "boolean" },
  },
} as const);

const description: ComponentDescription = {
  capability: "fluent:text",
  summary: "Renders basic text with Fluent 2 typography while preserving its authored HTML semantics.",
  dataProp: "value",
  events: [],
  semanticTokens: [],
  defaultVariant: "body",
  variants: [
    { value: "body", summary: "Uses standard body typography.", useWhen: ["Text is ordinary prose or a short value"] },
    { value: "caption", summary: "Uses compact supporting typography.", useWhen: ["Text annotates or qualifies nearby content"] },
    { value: "subtitle", summary: "Uses emphasized section-support typography.", useWhen: ["Text introduces a compact subsection"] },
    { value: "title", summary: "Uses prominent title typography.", useWhen: ["Text names a page or major region"] },
    { value: "display", summary: "Uses the largest display typography.", useWhen: ["A sparse surface needs one dominant textual signal"] },
  ],
  authoring: {
    useWhen: ["A scalar string needs basic Fluent typography", "A heading, label, caption, or prose value needs explicit HTML semantics"],
    avoidWhen: ["Content contains Markdown or rich document structure", "Text is an interactive input or command"],
    rules: [
      "Use as to express semantics and variant to express visual hierarchy",
      "Use h1 through h6 according to document structure rather than desired font size",
      "Use label with htmlFor only for a corresponding form control",
      "Do not encode Markdown in value",
    ],
  },
};

export const fluentTextDefinition = defineFluentComponent(description, schema, FluentText, {
  value: "Incident report analysis workbench",
  as: "h1",
  variant: "title",
  block: true,
});