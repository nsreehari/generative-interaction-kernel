import React from "react";
import { makeStyles, mergeClasses } from "@fluentui/react-components";
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

export const GROWING_CONTAINER_FOLLOW_END = ["always", "when-at-end", "off"] as const;
export type GrowingContainerFollowEnd = typeof GROWING_CONTAINER_FOLLOW_END[number];

export interface GrowingContainerScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export interface GrowingContainerProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  followEnd?: GrowingContainerFollowEnd;
  ariaLabel?: string;
}

const useStyles = makeStyles({
  root: {
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    maxWidth: "100%",
    maxHeight: "100%",
    overflow: "auto",
    overscrollBehavior: "contain",
  },
  content: { minWidth: 0, minHeight: "100%" },
});

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export function isGrowingContainerPinnedToEnd(
  metrics: GrowingContainerScrollMetrics,
  threshold = 8,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold;
}

export function shouldGrowingContainerFollowEnd(
  mode: GrowingContainerFollowEnd,
  pinnedToEnd: boolean,
): boolean {
  return mode === "always" || (mode === "when-at-end" && pinnedToEnd);
}

export function GrowingContainer({
  children,
  className,
  style,
  followEnd = "always",
  ariaLabel,
}: GrowingContainerProps): React.ReactElement {
  const styles = useStyles();
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const pinnedToEndRef = React.useRef(true);

  const scrollToEnd = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, []);

  useIsomorphicLayoutEffect(() => {
    const content = contentRef.current;
    if (!viewportRef.current || !content || followEnd === "off") return;

    const onContentResize = () => {
      if (shouldGrowingContainerFollowEnd(followEnd, pinnedToEndRef.current)) scrollToEnd();
    };
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(onContentResize);
    observer?.observe(content);
    scrollToEnd();
    return () => observer?.disconnect();
  }, [followEnd, scrollToEnd]);

  const onScroll = () => {
    const viewport = viewportRef.current;
    if (viewport) pinnedToEndRef.current = isGrowingContainerPinnedToEnd(viewport);
  };

  return (
    <div
      ref={viewportRef}
      className={mergeClasses(styles.root, "gik-growing-container", className)}
      style={style}
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
      onScroll={onScroll}
    >
      <div
        ref={contentRef}
        className={mergeClasses(styles.content, "gik-growing-container-content")}
      >
        {children}
      </div>
    </div>
  );
}

export const GrowingContainerPrimitive: ProjectionView = ({ node, children }) => {
  const requestedFollowEnd = node.props.followEnd;
  const followEnd = GROWING_CONTAINER_FOLLOW_END.includes(requestedFollowEnd as GrowingContainerFollowEnd)
    ? requestedFollowEnd as GrowingContainerFollowEnd
    : "always";
  const ariaLabel = typeof node.props.ariaLabel === "string" ? node.props.ariaLabel : undefined;
  return <GrowingContainer {...componentRootProps(node)} followEnd={followEnd} ariaLabel={ariaLabel}>{children}</GrowingContainer>;
};

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  properties: {
    ...componentStylePropsSchema,
    followEnd: { enum: GROWING_CONTAINER_FOLLOW_END },
    ariaLabel: { type: "string", minLength: 1 },
  },
} as const;

const description: ComponentDescription = {
  capability: "primitive:growing-container",
  summary: "Provides a bounded scrolling viewport that can follow content appended at its end.",
  slots: ["children"],
  events: [],
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: [
      "A bounded region receives content incrementally",
      "The viewport should own overflow and optionally follow appended content",
    ],
    avoidWhen: [
      "The parent already owns scrolling",
      "Content should expand the surrounding document instead of remaining bounded",
    ],
    rules: [
      "Place rendered content in the children slot",
      "Use always for output surfaces that must stay at the newest content",
      "Use when-at-end when users must be able to scroll back without being pulled to the end",
      "Use off when the viewport must never move automatically",
      "Provide ariaLabel when the scrolling region needs an accessible name",
    ],
  },
};

export function describeGrowingContainer(): ComponentDescription {
  return description;
}

export function getGrowingContainerSchema(): Record<string, unknown> {
  return schema as unknown as Record<string, unknown>;
}

export function validateGrowingContainer(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema: getGrowingContainerSchema(),
    message: "Invalid primitive:growing-container props",
    code: "primitive-growing-container-schema",
  }], props as Json);
}

export function materializeGrowingContainerTrial() {
  return trialNode("primitive:growing-container", {
    followEnd: "when-at-end",
    ariaLabel: "Streaming output",
  });
}

export const growingContainerDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: GrowingContainerPrimitive,
  getSchema: getGrowingContainerSchema,
  validate: validateGrowingContainer,
  materializeTrial: materializeGrowingContainerTrial,
});