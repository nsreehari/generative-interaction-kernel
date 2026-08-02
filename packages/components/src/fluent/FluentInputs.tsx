import React from "react";
import { Dropdown, Field, Option, Switch, ToggleButton, mergeClasses } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView, type ProjectionViewProps } from "@gik/react";

import {
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
  type DeclarativeComponentDefinition,
} from "../definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared";

export interface FluentSwitchControlProps {
  checked: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function FluentSwitchControl({
  checked,
  onLabel,
  offLabel,
  onToggle,
  disabled = false,
  ariaLabel,
  className,
  style,
}: FluentSwitchControlProps): React.ReactElement {
  return (
    <Switch
      className={mergeClasses("gx-fluent-switch", className)}
      style={style}
      checked={checked}
      disabled={disabled}
      label={checked ? onLabel : offLabel}
      labelPosition="after"
      aria-label={ariaLabel}
      onChange={(_, data) => onToggle(data.checked)}
    />
  );
}

function readToggleState(node: ProjectionViewProps["node"]): {
  checked: boolean;
  label: string;
  onValue: string;
  offValue: string;
} {
  const props = readProps(node);
  const onValue = props.str("onValue", "on");
  const offValue = props.str("offValue", "off");
  const checked = node.props.checked === true || node.props.value === onValue;
  return {
    checked,
    label: checked
      ? props.str("onLabel", props.str("label"))
      : props.str("offLabel", props.str("label")),
    onValue,
    offValue,
  };
}

export const FluentSwitch: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const state = readToggleState(node);
  const name = props.str("name");
  const rootProps = componentRootProps(node, "gx-fluent-switch");
  return (
    <FluentSwitchControl
      {...rootProps}
      checked={state.checked}
      disabled={props.bool("disabled")}
      onLabel={props.str("onLabel", props.str("label"))}
      offLabel={props.str("offLabel", props.str("label"))}
      ariaLabel={props.str("ariaLabel") || undefined}
      onToggle={(checked) => void emit("toggle", {
        checked,
        value: checked ? state.onValue : state.offValue,
        ...(name ? { name } : {}),
      })}
    />
  );
};

export const FluentToggle: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const state = readToggleState(node);
  const minWidth = typeof node.props.minWidth === "number" || typeof node.props.minWidth === "string"
    ? node.props.minWidth
    : undefined;
  const rootProps = componentRootProps(node, "gx-fluent-toggle");
  return (
    <ToggleButton
      {...rootProps}
      checked={state.checked}
      disabled={props.bool("disabled")}
      size="small"
      style={{ minWidth, ...rootProps.style }}
      onClick={() => void emit("toggle", {
        checked: !state.checked,
        value: state.checked ? state.offValue : state.onValue,
      })}
    >
      {state.label}
    </ToggleButton>
  );
};

export const FluentDropdown: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const [open, setOpen] = React.useState(false);
  const options = Array.isArray(node.props.options)
    ? node.props.options.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const value = String(item.value ?? item.id ?? "");
      if (!value) return [];
      return [{ value, label: String(item.label ?? value), disabled: item.disabled === true }];
    })
    : [];
  const value = props.str("value");
  const selected = options.find((option) => option.value === value);

  const label = props.str("label");
  return (
    <Field {...componentRootProps(node)} label={label || undefined} required={props.bool("required")}>
      <Dropdown
        className="gx-fluent-dropdown"
        open={open}
        button={{
          onPointerDown: (event) => {
            if (event.button === 0 && !open) setOpen(true);
          },
        }}
        onOpenChange={(_, data) => setOpen(data.open)}
        aria-label={props.str("ariaLabel") || label || undefined}
        placeholder={props.str("placeholder") || undefined}
        disabled={props.bool("disabled")}
        value={selected?.label ?? ""}
        selectedOptions={value ? [value] : []}
        onOptionSelect={(_, data) => {
          if (!data.optionValue) return;
          const option = options.find((candidate) => candidate.value === data.optionValue);
          setOpen(false);
          void emit("select", { value: data.optionValue, label: option?.label ?? data.optionText });
        }}
      >
        {options.map((option) => (
          <Option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</Option>
        ))}
      </Dropdown>
    </Field>
  );
};

const toggleProperties = {
  value: { type: "string" },
  checked: { type: "boolean" },
  onValue: { type: "string" },
  offValue: { type: "string" },
  label: { type: "string" },
  onLabel: { type: "string" },
  offLabel: { type: "string" },
  disabled: { type: "boolean" },
  ariaLabel: { type: "string" },
  name: { type: "string" },
} as const;

const switchSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: toggleProperties,
} as const);

const toggleSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    ...toggleProperties,
    minWidth: { type: ["string", "number"] },
  },
} as const);

const dropdownSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "string" },
          id: { type: "string" },
          label: { type: "string" },
          disabled: { type: "boolean" },
        },
        anyOf: [{ required: ["value"] }, { required: ["id"] }],
      },
    },
    label: { type: "string" },
    placeholder: { type: "string" },
    ariaLabel: { type: "string" },
    required: { type: "boolean" },
    disabled: { type: "boolean" },
  },
  required: ["options"],
} as const);

function description(
  capability: string,
  summary: string,
  event: string,
  useWhen: string,
  rules: string[],
): ComponentDescription {
  return {
    capability,
    summary,
    events: [event],
    semanticTokens: [],
    variants: [],
    authoring: {
      useWhen: [useWhen],
      avoidWhen: ["A domain-specific component owns the interaction contract"],
      rules,
    },
  };
}

const switchDescription = description(
  "fluent:switch",
  "Renders a Fluent 2 binary switch with value-derived state.",
  "toggle",
  "A binary setting benefits from a track-and-thumb control",
  ["Declare stable on and off values", "Handle toggle outside the component"],
);
const toggleDescription = description(
  "fluent:toggle",
  "Renders a compact Fluent 2 pressed-state toggle button.",
  "toggle",
  "A binary mode needs a compact button presentation",
  ["Declare stable on and off values", "Use minWidth when labels change width", "Handle toggle outside the component"],
);
const dropdownDescription = description(
  "fluent:dropdown",
  "Renders a single-select Fluent 2 dropdown from declarative options.",
  "select",
  "A user selects one value from a small option set",
  ["Provide stable option values", "Provide label or ariaLabel", "Handle select outside the component"],
);

function validate(schema: Record<string, unknown>, capability: string, props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{
    kind: "ajv-schema",
    schema,
    message: `Invalid ${capability} props`,
    code: `${capability.replace(":", "-")}-schema`,
  }], props as Json);
}

function definition(
  componentDescription: ComponentDescription,
  schema: Record<string, unknown>,
  component: ProjectionView,
  trialProps: Record<string, Json>,
): DeclarativeComponentDefinition {
  return {
    capability: componentDescription.capability,
    version: "1.0.0",
    summary: componentDescription.summary,
    events: componentDescription.events,
    semanticTokens: componentDescription.semanticTokens,
    variants: componentDescription.variants,
    authoring: componentDescription.authoring,
    component,
    describe: () => componentDescription,
    getSchema: () => schema,
    validate: (props) => validate(schema, componentDescription.capability, props),
    materializeTrial: () => trialNode(componentDescription.capability, trialProps),
  };
}

export const fluentSwitchDefinition = definition(switchDescription, switchSchema, FluentSwitch, {
  value: "auto",
  onValue: "auto",
  offValue: "manual",
  onLabel: "Auto",
  offLabel: "Manual",
});

export const fluentToggleDefinition = definition(toggleDescription, toggleSchema, FluentToggle, {
  value: "auto",
  onValue: "auto",
  offValue: "manual",
  onLabel: "Auto",
  offLabel: "Manual",
  minWidth: 72,
});

export const fluentDropdownDefinition = definition(dropdownDescription, dropdownSchema, FluentDropdown, {
  value: "soc-t3",
  ariaLabel: "Select demo Blueprint",
  options: [
    { value: "soc-t3", label: "Governed SOC investigation" },
    { value: "soc-executive", label: "SOC executive walkthrough" },
  ],
});
