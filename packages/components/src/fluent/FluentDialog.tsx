import React from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  type DialogProps,
} from "@fluentui/react-components";
import { readProps, type ProjectionViewProps } from "@gik/react";

import { eventContract, type ComponentDescription } from "../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared/component";
import { defineFluentComponent } from "./defineFluentComponent";

const modalTypes = ["modal", "non-modal", "alert"] as const;
type FluentDialogModalType = Extract<DialogProps["modalType"], typeof modalTypes[number]>;

export const FluentDialog = ({ node, emit, children }: ProjectionViewProps) => {
  const props = readProps(node);
  return (
    <Dialog
      open={props.bool("open")}
      modalType={props.str("modalType", "modal") as FluentDialogModalType}
      onOpenChange={(_event, data) => void emit("openChange", { open: data.open })}
    >
      <DialogSurface
        {...componentRootProps(node)}
        aria-label={props.str("ariaLabel") || props.str("title") || undefined}
      >
        <DialogBody>
          <DialogTitle>{props.str("title")}</DialogTitle>
          <DialogContent>{children}</DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

const dialogSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  required: ["open", "title"],
  properties: {
    open: { type: "boolean" },
    title: { type: "string", minLength: 1 },
    ariaLabel: { type: "string", minLength: 1 },
    modalType: { type: "string", enum: modalTypes },
  },
} as const);

const dialogDescription: ComponentDescription = {
  capability: "fluent:dialog",
  summary: "Renders a controlled Fluent 2 dialog whose native surface owns modality, focus, and dismissal.",
  slots: ["children"],
  events: ["openChange"],
  eventContracts: { openChange: eventContract("The dialog requests a change to its controlled open state.", { open: { type: "boolean" } }) },
  semanticTokens: [],
  defaultVariant: "standard",
  variants: [
    { value: "standard", summary: "Uses Fluent's standard dialog surface.", useWhen: ["Content requires a focused temporary surface"] },
  ],
  authoring: {
    useWhen: ["A temporary surface must interrupt or supplement the current workflow"],
    avoidWhen: ["The content belongs in the page flow", "A domain-specific composite already owns the workflow"],
    rules: ["Bind open to authored state", "Handle openChange outside the component", "Place dialog content in children"],
  },
};

export const fluentDialogDefinition = defineFluentComponent(
  dialogDescription,
  dialogSchema,
  FluentDialog,
  { open: true, title: "Review details" },
);