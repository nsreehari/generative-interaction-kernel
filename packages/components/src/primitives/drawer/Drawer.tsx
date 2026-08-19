import React from "react";
import {
  Button,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  ChevronLeftRegular,
  ChevronRightRegular,
} from "@fluentui/react-icons";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import {
  defineComponent,
  eventContract,
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
} from "../../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../../shared/component";

export const DRAWER_VARIANTS = ["panel-vertical"] as const;
export type DrawerVariant = typeof DRAWER_VARIANTS[number];

const FAB_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

const useStyles = makeStyles({
  root: {
    position: "fixed",
    top: tokens.spacingVerticalS,
    bottom: tokens.spacingVerticalS,
    zIndex: 1040,
    display: "flex",
    alignItems: "flex-start",
    pointerEvents: "none",
  },
  left: { left: tokens.spacingHorizontalS },
  right: { right: tokens.spacingHorizontalS, flexDirection: "row-reverse" },
  toggle: {
    zIndex: 2,
    pointerEvents: "auto",
    boxShadow: tokens.shadow8,
  },
  bottom: { alignSelf: "flex-end" },
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    backgroundColor: tokens.colorBackgroundOverlay,
    pointerEvents: "none",
  },
  panel: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    width: "min(var(--gik-drawer-width), calc(100vw - 4.5rem))",
    height: "100%",
    minWidth: 0,
    overflow: "auto",
    boxSizing: "border-box",
    padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow64,
    pointerEvents: "auto",
  },
});

export const Drawer: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const props = readProps(node);
  const position = props.str("fabPosition", "top-left");
  const isRight = position.endsWith("-right");
  const isBottom = position.startsWith("bottom-");
  const controlled = typeof node.props.open === "boolean";
  const [localOpen, setLocalOpen] = React.useState(() => props.bool("defaultOpen"));
  const open = controlled ? props.bool("open") : localOpen;
  const title = props.str("title", "Panel");
  const openLabel = props.str("openLabel", `Open ${title}`);
  const closeLabel = props.str("closeLabel", `Close ${title}`);
  const authoredWidth = typeof node.props.panelWidthPercent === "number" ? node.props.panelWidthPercent : 80;
  const width = Math.min(80, Math.max(20, authoredWidth));
  const rootProps = componentRootProps(node);

  return (
    <aside
      {...rootProps}
      className={mergeClasses(styles.root, isRight ? styles.right : styles.left, rootProps.className)}
      aria-label={props.str("ariaLabel", title)}
    >
      <Button
        className={mergeClasses(styles.toggle, isBottom && styles.bottom)}
        appearance="primary"
        shape="circular"
        size="large"
        icon={isRight === open ? <ChevronRightRegular /> : <ChevronLeftRegular />}
        aria-label={open ? closeLabel : openLabel}
        title={open ? closeLabel : openLabel}
        aria-expanded={open}
        onClick={() => {
          const nextOpen = !open;
          if (!controlled) setLocalOpen(nextOpen);
          void emit("openChange", { open: nextOpen });
        }}
      />
      {open ? (
        <>
          <div className={styles.backdrop} aria-hidden="true" />
          <div
            className={styles.panel}
            style={{ "--gik-drawer-width": `${width}vw` } as React.CSSProperties}
          >
            {children}
          </div>
        </>
      ) : null}
    </aside>
  );
};

const schema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    variant: { enum: DRAWER_VARIANTS },
    open: { type: "boolean" },
    defaultOpen: { type: "boolean" },
    fabPosition: { enum: FAB_POSITIONS },
    ariaLabel: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    openLabel: { type: "string", minLength: 1 },
    closeLabel: { type: "string", minLength: 1 },
    panelWidthPercent: { type: "number", minimum: 20, maximum: 80 },
  },
} as const);

const description: ComponentDescription = {
  capability: "primitive:drawer",
  summary: "Renders one self-contained floating drawer whose vertical panel opens from an authored board corner.",
  slots: ["children"],
  events: ["openChange"],
  eventContracts: {
    openChange: eventContract("The drawer open state changed; handling this event is optional unless open is controlled.", { open: { type: "boolean" } }),
  },
  semanticTokens: [],
  defaultVariant: "panel-vertical",
  variants: [{
    value: "panel-vertical",
    summary: "Composes a corner-pinned circular toggle with one full-height floating panel.",
    useWhen: ["Secondary tools must overlay a workspace without resizing it"],
  }],
  authoring: {
    useWhen: ["A workspace needs an independently controlled floating side panel"],
    avoidWhen: ["Content should permanently share horizontal space", "A modal decision interrupts the workflow"],
    rules: [
      "Prefer local drawer state; use defaultOpen only to choose its initial state",
      "Bind open only when application behavior or cross-Cell coordination must control the drawer",
      "Handle openChange only when the application needs to observe or control drawer state",
      "Place all authored children inside the panel",
      "Choose the toggle corner with fabPosition",
      "Provide concise accessible labels",
    ],
  },
};

export function validateDrawer(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema,
    message: "Invalid primitive:drawer props",
    code: "primitive-drawer-schema",
  }], props as Json);
}

export function materializeDrawerTrial() {
  return trialNode("primitive:drawer", {
    variant: "panel-vertical",
    defaultOpen: true,
    fabPosition: "top-left",
    title: "Source reports",
    panelWidthPercent: 80,
  });
}

export const drawerDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: Drawer,
  getSchema: () => schema as unknown as Record<string, unknown>,
  validate: validateDrawer,
  materializeTrial: materializeDrawerTrial,
});