import { Dropdown, Field, Option, Switch, ToggleButton } from "@fluentui/react-components";
import { readProps, type ProjectionView, type ProjectionViewProps } from "@gik/react";

import { eventContract, type ComponentDescription } from "../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared/component";
import { defineFluentComponent } from "./defineFluentComponent";
import { FLUENT_CONTROL_SIZES, resolveControlSize, STANDARD_COMPACT_VARIANTS } from "./fluentVariants";
import { fluentOptionSchema, readFluentOptions } from "./readFluentOptions";

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
  return (
    <Switch
      {...componentRootProps(node)}
      checked={state.checked}
      size={resolveControlSize(props.str("size"), node.props.variant) === "small" ? "small" : undefined}
      disabled={props.bool("disabled")}
      label={state.label}
      aria-label={props.str("ariaLabel") || undefined}
      onChange={(_, data) => void emit("toggle", {
        checked: data.checked,
        value: data.checked ? state.onValue : state.offValue,
        ...(name ? { name } : {}),
      })}
    />
  );
};

export const FluentToggle: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const state = readToggleState(node);
  return (
    <ToggleButton
      {...componentRootProps(node)}
      checked={state.checked}
      size={resolveControlSize(props.str("size"), node.props.variant)}
      disabled={props.bool("disabled")}
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
  const options = readFluentOptions(node.props.options);
  const value = props.str("value");
  const selected = options.find((option) => option.value === value);

  const label = props.str("label");
  return (
    <Field {...componentRootProps(node)} label={label || undefined} required={props.bool("required")}>
      <Dropdown
        aria-label={props.str("ariaLabel") || label || undefined}
        size={resolveControlSize(props.str("size"), node.props.variant)}
        placeholder={props.str("placeholder") || undefined}
        disabled={props.bool("disabled")}
        value={selected?.label ?? ""}
        selectedOptions={value ? [value] : []}
        onOptionSelect={(_, data) => {
          if (!data.optionValue) return;
          const option = options.find((candidate) => candidate.value === data.optionValue);
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
  size: { type: "string", enum: FLUENT_CONTROL_SIZES },
} as const;

const switchSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: toggleProperties,
} as const);

const toggleSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: toggleProperties,
} as const);

const dropdownSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: "string" },
    options: {
      type: "array",
      items: fluentOptionSchema,
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
  eventSummary: string,
  eventProperties: Record<string, unknown>,
  requiredProperties: readonly string[],
  useWhen: string,
  rules: string[],
): ComponentDescription {
  return {
    capability,
    summary,
    events: [event],
    eventContracts: { [event]: eventContract(eventSummary, eventProperties, requiredProperties) },
    semanticTokens: [],
    defaultVariant: "standard",
    variants: STANDARD_COMPACT_VARIANTS,
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
  "The switch changes between its authored values.",
  { checked: { type: "boolean" }, value: { type: "string" }, name: { type: "string" } },
  ["checked", "value"],
  "A binary setting benefits from a track-and-thumb control",
  ["Declare stable on and off values", "Handle toggle outside the component"],
);
const toggleDescription = description(
  "fluent:toggle",
  "Renders a compact Fluent 2 pressed-state toggle button.",
  "toggle",
  "The pressed state changes between its authored values.",
  { checked: { type: "boolean" }, value: { type: "string" } },
  ["checked", "value"],
  "A binary mode needs a compact button presentation",
  ["Declare stable on and off values", "Handle toggle outside the component"],
);
const dropdownDescription = description(
  "fluent:dropdown",
  "Renders a single-select Fluent 2 dropdown from declarative options.",
  "select",
  "The selected option changes.",
  { value: { type: "string" }, label: { type: "string" } },
  ["value", "label"],
  "A user selects one value from a small option set",
  ["Provide stable option values", "Provide label or ariaLabel", "Handle select outside the component"],
);

export const fluentSwitchDefinition = defineFluentComponent(switchDescription, switchSchema, FluentSwitch, {
  value: "auto",
  onValue: "auto",
  offValue: "manual",
  onLabel: "Auto",
  offLabel: "Manual",
});

export const fluentToggleDefinition = defineFluentComponent(toggleDescription, toggleSchema, FluentToggle, {
  value: "auto",
  onValue: "auto",
  offValue: "manual",
  onLabel: "Auto",
  offLabel: "Manual",
});

export const fluentDropdownDefinition = defineFluentComponent(dropdownDescription, dropdownSchema, FluentDropdown, {
  value: "soc-t3",
  ariaLabel: "Select demo Blueprint",
  options: [
    { value: "soc-t3", label: "Governed SOC investigation" },
    { value: "soc-executive", label: "SOC executive walkthrough" },
  ],
});
