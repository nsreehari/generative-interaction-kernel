// Leaf authoring invariant: component-local hook state and React context are allowed.
// External state must arrive through props and changes must leave through emit handlers.
// Do not add mutable module-level runtime state, caches, registries, or shared memory here.
// Every leaf in this file must be a thin prop/event adapter over an actual Fluent component.
// Product behavior and multi-component compositions belong in product-specific leaf providers.

import React from "react";
import {
  Badge,
  Button,
  Dropdown,
  Option,
  Persona,
  Spinner,
  Tab,
  TabList,
  ToggleButton,
  type BadgeProps,
  type ButtonProps,
  type PersonaProps,
  type SpinnerProps,
  type TabListProps,
} from "@fluentui/react-components";
import {
  readProps,
  type ProjectionViewProps,
  type ProviderMap,
} from "@gik/react";

interface DropdownOption {
  id?: unknown;
  value?: unknown;
  label?: unknown;
  shortDescription?: unknown;
  disabled?: unknown;
}

function ButtonLeaf({ node, emit }: ProjectionViewProps) {
  const props = readProps(node);
  if (props.bool("hidden")) return null;

  return (
    <Button
      appearance={props.str("appearance", "secondary") as ButtonProps["appearance"]}
      aria-label={props.str("ariaLabel") || undefined}
      disabled={props.bool("disabled")}
      size={props.str("size", "small") as ButtonProps["size"]}
      onClick={() => emit("press", {})}
    >
      {props.str("label")}
    </Button>
  );
}

function BadgeLeaf({ node }: ProjectionViewProps) {
  const props = readProps(node);
  if (props.bool("hidden")) return null;

  return (
    <Badge
      appearance={props.str("appearance", "tint") as BadgeProps["appearance"]}
      color={props.str("color", "informative") as BadgeProps["color"]}
      shape={props.str("shape", "rounded") as BadgeProps["shape"]}
      size={props.str("size", "small") as BadgeProps["size"]}
    >
      {props.str("label")}
    </Badge>
  );
}

function DropdownLeaf({ node, emit }: ProjectionViewProps) {
  const props = readProps(node);
  const [open, setOpen] = React.useState(false);
  if (props.bool("hidden")) return null;

  const optionSource = node.props.options;
  const optionEntries: Array<[string | undefined, DropdownOption]> = Array.isArray(optionSource)
    ? optionSource.flatMap((item) => item && typeof item === "object" && !Array.isArray(item)
      ? [[undefined, item as DropdownOption]]
      : [])
    : optionSource && typeof optionSource === "object"
      ? Object.entries(optionSource).flatMap(([id, item]) => item && typeof item === "object" && !Array.isArray(item)
        ? [[id, item as DropdownOption]]
        : [])
      : [];
  const options = optionEntries.flatMap(([key, item]) => {
    const value = String(item.value ?? item.id ?? key ?? "");
    if (!value) return [];
    return [{
      value,
      label: String(item.label ?? item.shortDescription ?? value),
      disabled: item.disabled === true,
    }];
  });
  const value = props.str("value");
  const selected = options.find((option) => option.value === value);

  return (
    <Dropdown
      aria-label={props.str("ariaLabel") || undefined}
      disabled={props.bool("disabled")}
      open={open}
      placeholder={props.str("placeholder") || undefined}
      selectedOptions={value ? [value] : []}
      value={selected?.label ?? ""}
      onOpenChange={(_, data) => setOpen(data.open)}
      onOptionSelect={(_, data) => {
        if (!data.optionValue) return;
        const option = options.find((candidate) => candidate.value === data.optionValue);
        setOpen(false);
        emit("select", {
          value: data.optionValue,
          label: option?.label ?? data.optionText,
        });
      }}
    >
      {options.map((option) => (
        <Option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </Option>
      ))}
    </Dropdown>
  );
}

function PersonaLeaf({ node }: ProjectionViewProps) {
  const props = readProps(node);
  if (props.bool("hidden")) return null;

  return (
    <Persona
      name={props.str("name")}
      presenceOnly={props.bool("presenceOnly")}
      secondaryText={props.str("secondaryText") || undefined}
      size={props.str("size", "small") as PersonaProps["size"]}
      tertiaryText={props.str("tertiaryText") || undefined}
      textAlignment={props.str("textAlignment", "center") as PersonaProps["textAlignment"]}
    />
  );
}

function SpinnerLeaf({ node }: ProjectionViewProps) {
  const props = readProps(node);
  if (props.bool("hidden")) return null;

  return (
    <Spinner
      appearance={props.str("appearance", "primary") as SpinnerProps["appearance"]}
      label={props.str("label") || undefined}
      labelPosition={props.str("labelPosition", "after") as SpinnerProps["labelPosition"]}
      size={props.str("size", "tiny") as SpinnerProps["size"]}
    />
  );
}

function ToggleLeaf({ node, emit }: ProjectionViewProps) {
  const props = readProps(node);
  if (props.bool("hidden")) return null;

  const onValue = node.props.onValue ?? "on";
  const offValue = node.props.offValue ?? "off";
  const checked = node.props.checked === true || node.props.value === onValue;
  const label = checked
    ? props.str("onLabel", props.str("label"))
    : props.str("offLabel", props.str("label"));

  return (
    <ToggleButton
      aria-label={props.str("ariaLabel") || undefined}
      checked={checked}
      disabled={props.bool("disabled")}
      size="small"
      onClick={() => emit("toggle", {
        checked: !checked,
        value: checked ? offValue : onValue,
      })}
    >
      {label}
    </ToggleButton>
  );
}

function TabLeaf({ node }: ProjectionViewProps) {
  const props = readProps(node);
  if (props.bool("hidden")) return null;

  return (
    <Tab disabled={props.bool("disabled")} value={props.str("value", node.id)}>
      {props.str("label")}
    </Tab>
  );
}

function TabListLeaf({ node, emit, children }: ProjectionViewProps) {
  const props = readProps(node);
  if (props.bool("hidden")) return null;

  return (
    <TabList
      appearance={props.str("appearance", "subtle") as TabListProps["appearance"]}
      aria-label={props.str("ariaLabel") || undefined}
      disabled={props.bool("disabled")}
      selectedValue={props.str("value") || undefined}
      size={props.str("size", "small") as TabListProps["size"]}
      vertical={props.bool("vertical")}
      onTabSelect={(_, data) => emit("select", { value: data.value })}
    >
      {children}
    </TabList>
  );
}

export const fluentLeavesV1: ProviderMap = {
  badge: BadgeLeaf,
  button: ButtonLeaf,
  dropdown: DropdownLeaf,
  persona: PersonaLeaf,
  spinner: SpinnerLeaf,
  toggle: ToggleLeaf,
  tab: TabLeaf,
  "tab-list": TabListLeaf,
};