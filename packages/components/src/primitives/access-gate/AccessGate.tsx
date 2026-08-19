import React from "react";
import type { Json, ResolvedNode } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionViewProps } from "@gik/react";

import { FluentButton } from "../../fluent/FluentButtons";
import { FluentDialog } from "../../fluent/FluentDialog";
import { FluentSpinner } from "../../fluent/FluentDisplayControls";
import {
  defineComponent,
  eventContract,
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
} from "../../shared/definition";
import { asRecord, withComponentStylePropsSchema } from "../../shared/component";
import { Form, formDefinition } from "../form";

interface AccessGateData {
  triggered?: boolean;
  status?: string;
  title?: string;
  message?: string;
  error?: string;
  inputFormSpec?: Record<string, unknown>;
  actions?: Record<string, unknown>;
}

function projectionNode(id: string, capability: string, props: Record<string, Json>): ResolvedNode {
  return { id, capability, props, visible: true, fallback: false, children: [] };
}

export const AccessGate = ({ node, emit, children }: ProjectionViewProps) => {
  const props = readProps(node);
  const access = props.obj<AccessGateData>("access", {});
  if (!access.triggered) return <>{children}</>;

  const status = access.status ?? "required";
  const title = access.title ?? "Access required";
  const formSpec = asRecord(access.inputFormSpec);
  const actions = asRecord(access.actions);
  const dialogNode = projectionNode(`${node.id}-dialog`, "fluent:dialog", {
    defaultOpen: true,
    title,
    ariaLabel: title,
    modalType: "modal",
    ...(node.props.className ? { className: node.props.className } : {}),
    ...(node.props.style ? { style: node.props.style } : {}),
  });
  const formNode = projectionNode(`${node.id}-form`, "primitive:form", formSpec as Record<string, Json>);
  const button = (name: string, defaultLabel: string, event: string, appearance?: string) => (
    actions[name] !== true ? null : (
      <FluentButton
        key={name}
        node={projectionNode(`${node.id}-${name}`, "fluent:button", {
          label: typeof actions[`${name}Label`] === "string" ? actions[`${name}Label`] as string : defaultLabel,
          ...(appearance ? { appearance } : {}),
        })}
        emit={() => emit(event, {})}
        children={undefined}
      />
    )
  );

  return (
    <FluentDialog
      node={dialogNode}
      emit={(_event, payload) => {
        const change = asRecord(payload);
        if (change.open === false) void emit("dismiss", {});
      }}
      children={(
        <div className="gx-access-gate-content">
          {access.message ? <p>{access.message}</p> : null}
          {access.error ? <p role="alert">{access.error}</p> : null}
          {status === "checking" ? (
            <FluentSpinner
              node={projectionNode(`${node.id}-spinner`, "fluent:spinner", { label: "Checking access..." })}
              emit={() => undefined}
              children={undefined}
            />
          ) : null}
          {Object.keys(formSpec).length > 0 ? (
            <Form
              node={formNode}
              emit={(_event, payload) => emit("submit", payload)}
              children={undefined}
            />
          ) : null}
          <div className="gx-access-gate-actions">
            {button("reset", "Reset", "reset")}
            {button("retry", "Retry", "retry", "primary")}
          </div>
        </div>
      )}
    />
  );
};

const accessGateSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  required: ["access"],
  properties: {
    access: {
      type: "object",
      additionalProperties: false,
      required: ["triggered"],
      properties: {
        triggered: { type: "boolean" },
        status: { type: "string", enum: ["idle", "checking", "required", "error"] },
        title: { type: "string" },
        message: { type: "string" },
        error: { type: "string" },
        inputFormSpec: formDefinition.getSchema(),
        actions: {
          type: "object",
          additionalProperties: false,
          properties: {
            retry: { type: "boolean" },
            retryLabel: { type: "string" },
            reset: { type: "boolean" },
            resetLabel: { type: "string" },
          },
        },
      },
    },
  },
} as const);

const accessGateDescription: ComponentDescription = {
  capability: "primitive:access-gate",
  summary: "Gates protected children behind a controlled access workflow composed from declarative GIK controls.",
  dataProp: "access",
  slots: ["children"],
  events: ["submit", "retry", "reset", "dismiss"],
  eventContracts: {
    submit: eventContract("The user submits the authored access fields.", { values: { type: "object", additionalProperties: true } }),
    retry: eventContract("The user requests another access check."),
    reset: eventContract("The user requests that access state be reset."),
    dismiss: eventContract("The user dismisses the access prompt without completing the access workflow."),
  },
  semanticTokens: [],
  variants: [],
  authoring: {
    useWhen: ["Content availability depends on an externally managed access workflow"],
    avoidWhen: ["The workflow is a general confirmation without access input"],
    rules: [
      "Resolve authored conditions into access.triggered at the call site",
      "Describe credential fields through inputFormSpec",
      "Handle emitted events with declarative actions or effects",
      "Handle dismiss only when the application needs to react to cancellation",
      "Never place credentials in the trigger expression",
    ],
  },
};

export function validateAccessGate(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema: accessGateSchema,
    message: "Invalid primitive:access-gate props",
    code: "primitive-access-gate-schema",
  }], props as Json);
}

export function materializeAccessGateTrial() {
  return trialNode("primitive:access-gate", {
    access: {
      triggered: true,
      status: "required",
      title: "Connect to service",
      message: "Enter a credential to continue.",
      inputFormSpec: {
        fields: {
          properties: {
            credential: { type: "string", title: "Credential", format: "password" },
          },
          required: ["credential"],
        },
        value: { credential: "" },
        saveLabel: "Continue",
      },
      actions: { retry: false, reset: false },
    },
  });
}

export const accessGateDefinition = defineComponent({
  description: accessGateDescription,
  version: "1.0.0",
  component: AccessGate,
  getSchema: () => accessGateSchema,
  validate: validateAccessGate,
  materializeTrial: materializeAccessGateTrial,
});