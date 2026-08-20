import React from "react";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  makeStyles,
  mergeClasses,
  tokens,
  type ButtonProps,
} from "@fluentui/react-components";
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  DismissRegular,
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

export const PANE_WITH_TRIGGER_VARIANTS = ["drawer", "dialog-modal"] as const;
export type PaneWithTriggerVariant = typeof PANE_WITH_TRIGGER_VARIANTS[number];

const FAB_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
const TRIGGER_APPEARANCES = ["primary", "secondary", "subtle", "transparent", "outline"] as const;
type TriggerAppearance = Extract<ButtonProps["appearance"], typeof TRIGGER_APPEARANCES[number]>;

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

export const PaneWithTrigger: ProjectionView = ({ node, emit, children }) => {
  const styles = useStyles();
  const props = readProps(node);
  const variant = props.str("variant", "drawer") as PaneWithTriggerVariant;
  const position = props.str("fabPosition", "top-left");
  const isRight = position.endsWith("-right");
  const isBottom = position.startsWith("bottom-");
  const controlled = typeof node.props.open === "boolean";
  const [localOpen, setLocalOpen] = React.useState(() => props.bool("defaultOpen"));
  const open = controlled ? props.bool("open") : localOpen;
  const title = props.str("title", "Panel");
  const openLabel = props.str("openLabel", `Open ${title}`);
  const closeLabel = props.str("closeLabel", `Close ${title}`);
  const triggerLabel = props.str("triggerLabel", openLabel);
  const authoredWidth = typeof node.props.panelWidthPercent === "number" ? node.props.panelWidthPercent : 80;
  const width = Math.min(80, Math.max(20, authoredWidth));
  const rootProps = componentRootProps(node);
  const setOpen = (nextOpen: boolean) => {
    if (!controlled) setLocalOpen(nextOpen);
    void emit("openChange", { open: nextOpen });
  };

  if (variant === "dialog-modal") {
    return (
      <Dialog
        open={open}
        modalType="modal"
        onOpenChange={(_event, data) => setOpen(data.open)}
      >
        <DialogTrigger disableButtonEnhancement>
          <Button appearance={props.str("triggerAppearance") as TriggerAppearance || undefined}>
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogSurface
          {...rootProps}
          aria-label={props.str("ariaLabel", title)}
        >
          <DialogBody>
            <DialogTitle
              action={(
                <DialogTrigger action="close" disableButtonEnhancement>
                  <Button appearance="subtle" icon={<DismissRegular />} aria-label={closeLabel} />
                </DialogTrigger>
              )}
            >
              {title}
            </DialogTitle>
            <DialogContent>{children}</DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    );
  }

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
        onClick={() => setOpen(!open)}
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
  required: ["variant", "title"],
  properties: {
    variant: { enum: PANE_WITH_TRIGGER_VARIANTS },
    open: { type: "boolean" },
    defaultOpen: { type: "boolean" },
    fabPosition: { enum: FAB_POSITIONS },
    ariaLabel: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    openLabel: { type: "string", minLength: 1 },
    closeLabel: { type: "string", minLength: 1 },
    triggerLabel: { type: "string", minLength: 1 },
    triggerAppearance: { type: "string", enum: TRIGGER_APPEARANCES },
    panelWidthPercent: { type: "number", minimum: 20, maximum: 80 },
  },
  allOf: [
    {
      if: { properties: { variant: { const: "dialog-modal" } }, required: ["variant"] },
      then: { required: ["triggerLabel", "closeLabel"] },
    },
  ],
} as const);

const description: ComponentDescription = {
  capability: "primitive:pane-with-trigger",
  summary: "Reveals authored children in a trigger-controlled drawer or modal dialog.",
  slots: ["children"],
  events: ["openChange"],
  eventContracts: {
    openChange: eventContract("The drawer open state changed; handling this event is optional unless open is controlled.", { open: { type: "boolean" } }),
  },
  semanticTokens: [],
  defaultVariant: "drawer",
  variants: [
    {
      value: "drawer",
      summary: "Composes a corner-pinned circular toggle with one full-height floating panel.",
      useWhen: ["Secondary tools must overlay a workspace without resizing it"],
    },
    {
      value: "dialog-modal",
      summary: "Composes a labeled trigger with a modal dialog, title, and close action.",
      useWhen: ["A focused temporary workflow must interrupt the current surface"],
    },
  ],
  authoring: {
    useWhen: ["Authored children belong in a temporary surface opened by its own trigger"],
    avoidWhen: ["Content should permanently remain in the page flow"],
    rules: [
      "Choose drawer for supplemental workspace content and dialog-modal for a focused modal workflow",
      "Prefer local pane state; use defaultOpen only to choose its initial state",
      "Bind open only when application behavior or cross-Cell coordination must control the drawer",
      "Handle openChange only when the application needs to observe or control pane state",
      "Place all authored children inside the pane",
      "For drawer, choose the toggle corner with fabPosition",
      "For dialog-modal, provide triggerLabel and closeLabel",
      "Provide concise accessible labels for both variants",
    ],
  },
};

export function validatePaneWithTrigger(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema,
    message: "Invalid primitive:pane-with-trigger props",
    code: "primitive-pane-with-trigger-schema",
  }], props as Json);
}

export function materializePaneWithTriggerTrial() {
  return trialNode("primitive:pane-with-trigger", {
    variant: "drawer",
    defaultOpen: true,
    fabPosition: "top-left",
    title: "Source reports",
    triggerLabel: "Open source reports",
    closeLabel: "Close source reports",
    panelWidthPercent: 80,
  });
}

export const paneWithTriggerDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: PaneWithTrigger,
  getSchema: () => schema as unknown as Record<string, unknown>,
  validate: validatePaneWithTrigger,
  materializeTrial: materializePaneWithTriggerTrial,
});