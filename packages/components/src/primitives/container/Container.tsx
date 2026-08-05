import React from "react";
import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import {
  defineComponent,
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
} from "../../shared/definition";
import { componentRootProps, componentStylePropsSchema } from "../../shared/component";

export const CONTAINER_VARIANTS = ["row", "column", "stack", "flex"] as const;
export const CONTAINER_GAPS = ["none", "xs", "s", "m", "l", "xl"] as const;
export const CONTAINER_ALIGNMENTS = ["stretch", "start", "center", "end", "baseline"] as const;
export const CONTAINER_JUSTIFICATIONS = ["start", "center", "end", "space-between", "space-around", "space-evenly"] as const;
export const CONTAINER_DIRECTIONS = ["row", "row-reverse", "column", "column-reverse"] as const;

export type ContainerVariant = typeof CONTAINER_VARIANTS[number];
export type ContainerGap = typeof CONTAINER_GAPS[number];
export type ContainerAlignment = typeof CONTAINER_ALIGNMENTS[number];
export type ContainerJustification = typeof CONTAINER_JUSTIFICATIONS[number];
export type ContainerDirection = typeof CONTAINER_DIRECTIONS[number];

export interface ContainerProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  variant?: ContainerVariant;
  gap?: ContainerGap;
  align?: ContainerAlignment;
  justify?: ContainerJustification;
  wrap?: boolean;
  direction?: ContainerDirection;
  fill?: boolean;
  grow?: boolean;
  fullWidth?: boolean;
  fullHeight?: boolean;
  ariaLabel?: string;
}

const useStyles = makeStyles({
  root: { boxSizing: "border-box", minWidth: 0, minHeight: 0 },
  row: { display: "flex", flexDirection: "row" },
  column: { display: "flex", flexDirection: "column" },
  stack: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)" },
  flex: { display: "flex" },
  wrap: { flexWrap: "wrap" },
  grow: { flex: "1 1 0" },
  fullWidth: { width: "100%", minWidth: 0 },
  fullHeight: { height: "100%", minHeight: 0 },
  gapNone: { gap: 0 },
  gapXs: { gap: tokens.spacingVerticalXS },
  gapS: { gap: tokens.spacingVerticalS },
  gapM: { gap: tokens.spacingVerticalM },
  gapL: { gap: tokens.spacingVerticalL },
  gapXl: { gap: tokens.spacingVerticalXL },
  alignStretch: { alignItems: "stretch" },
  alignStart: { alignItems: "flex-start" },
  alignCenter: { alignItems: "center" },
  alignEnd: { alignItems: "flex-end" },
  alignBaseline: { alignItems: "baseline" },
  justifyStart: { justifyContent: "flex-start" },
  justifyCenter: { justifyContent: "center" },
  justifyEnd: { justifyContent: "flex-end" },
  justifySpaceBetween: { justifyContent: "space-between" },
  justifySpaceAround: { justifyContent: "space-around" },
  justifySpaceEvenly: { justifyContent: "space-evenly" },
  directionRow: { flexDirection: "row" },
  directionRowReverse: { flexDirection: "row-reverse" },
  directionColumn: { flexDirection: "column" },
  directionColumnReverse: { flexDirection: "column-reverse" },
});

export function Container({
  children,
  className,
  style,
  variant = "column",
  gap = "m",
  align = "stretch",
  justify = "start",
  wrap = false,
  direction = "row",
  fill = false,
  grow = false,
  fullWidth = false,
  fullHeight = false,
  ariaLabel,
}: ContainerProps): React.ReactElement {
  const styles = useStyles();
  const gapClasses = { none: styles.gapNone, xs: styles.gapXs, s: styles.gapS, m: styles.gapM, l: styles.gapL, xl: styles.gapXl };
  const alignClasses = { stretch: styles.alignStretch, start: styles.alignStart, center: styles.alignCenter, end: styles.alignEnd, baseline: styles.alignBaseline };
  const justifyClasses = { start: styles.justifyStart, center: styles.justifyCenter, end: styles.justifyEnd, "space-between": styles.justifySpaceBetween, "space-around": styles.justifySpaceAround, "space-evenly": styles.justifySpaceEvenly };
  const directionClasses = { row: styles.directionRow, "row-reverse": styles.directionRowReverse, column: styles.directionColumn, "column-reverse": styles.directionColumnReverse };
  return (
    <div
      className={mergeClasses(
        styles.root,
        styles[variant],
        gapClasses[gap],
        alignClasses[align],
        justifyClasses[justify],
        variant === "flex" && directionClasses[direction],
        wrap && variant !== "stack" && styles.wrap,
        (fill || grow) && styles.grow,
        (fill || fullWidth) && styles.fullWidth,
        (fill || fullHeight) && styles.fullHeight,
        (fill || grow) && "gik-container-grow",
        (fill || fullWidth) && "gik-container-full-width",
        (fill || fullHeight) && "gik-container-full-height",
        "gik-container",
        `gik-container-${variant}`,
        className,
      )}
      style={style}
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return values.includes(value as T[number]) ? value as T[number] : fallback;
}

export const ContainerPrimitive: ProjectionView = ({ node, children }) => (
  <Container
    {...componentRootProps(node)}
    variant={enumValue(node.props.variant, CONTAINER_VARIANTS, "column")}
    gap={enumValue(node.props.gap, CONTAINER_GAPS, "m")}
    align={enumValue(node.props.align, CONTAINER_ALIGNMENTS, "stretch")}
    justify={enumValue(node.props.justify, CONTAINER_JUSTIFICATIONS, "start")}
    wrap={node.props.wrap === true}
    direction={enumValue(node.props.direction, CONTAINER_DIRECTIONS, "row")}
    fill={node.props.fill === true}
    grow={node.props.grow === true}
    fullWidth={node.props.fullWidth === true}
    fullHeight={node.props.fullHeight === true}
    ariaLabel={typeof node.props.ariaLabel === "string" ? node.props.ariaLabel : undefined}
  >
    {children}
  </Container>
);

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  properties: {
    ...componentStylePropsSchema,
    variant: { enum: CONTAINER_VARIANTS },
    gap: { enum: CONTAINER_GAPS },
    align: { enum: CONTAINER_ALIGNMENTS },
    justify: { enum: CONTAINER_JUSTIFICATIONS },
    wrap: { type: "boolean" },
    direction: { enum: CONTAINER_DIRECTIONS },
    fill: { type: "boolean" },
    grow: { type: "boolean" },
    fullWidth: { type: "boolean" },
    fullHeight: { type: "boolean" },
    ariaLabel: { type: "string", minLength: 1 },
  },
} as const;

const description: ComponentDescription = {
  capability: "primitive:container",
  summary: "Declaratively arranges child views without owning their data or behavior.",
  slots: ["children"],
  events: [],
  semanticTokens: [],
  defaultVariant: "column",
  variants: [
    { value: "row", summary: "Places children horizontally in source order.", useWhen: ["Peers belong on one horizontal line"] },
    { value: "column", summary: "Places children vertically in source order.", useWhen: ["A page or region flows from top to bottom"] },
    { value: "stack", summary: "Places children in a single-column grid.", useWhen: ["Grid sizing should align vertically stacked children"] },
    { value: "flex", summary: "Provides configurable flex direction, alignment, wrapping, and distribution.", useWhen: ["Responsive child distribution needs explicit flex controls"] },
  ],
  authoring: {
    useWhen: ["Child views need declarative spatial composition", "One projection root must contain several sibling regions"],
    avoidWhen: ["The surface has domain semantics better expressed by a semantic component", "The region needs bounded scrolling; use primitive:growing-container"],
    rules: [
      "Place composed views in the children slot",
      "Use row or column for ordinary one-axis layouts and flex only when direction or wrapping must be configurable",
      "Use stack for a single-column grid, not for overlapping layers",
      "Use named gap values instead of embedding spacing in child styles",
      "Use fullWidth or fullHeight for axis sizing, grow for flex growth, and fill only when all three behaviors are intended",
      "Do not bind authored data to a container; containers intentionally declare no dataProp",
    ],
  },
};

export function describeContainer(): ComponentDescription {
  return description;
}

export function getContainerSchema(): Record<string, unknown> {
  return schema as unknown as Record<string, unknown>;
}

export function validateContainer(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema: getContainerSchema(),
    message: "Invalid primitive:container props",
    code: "primitive-container-schema",
  }], props as Json);
}

export function materializeContainerTrial() {
  return trialNode("primitive:container", { variant: "column", gap: "m", fill: true, ariaLabel: "Content region" });
}

export const containerDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: ContainerPrimitive,
  getSchema: getContainerSchema,
  validate: validateContainer,
  materializeTrial: materializeContainerTrial,
});