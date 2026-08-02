import React from "react";
import { Button, Dropdown, Option, Switch, ToggleButton } from "@fluentui/react-components";
import {
  EditRegular,
  FullScreenMaximizeRegular,
  FullScreenMinimizeRegular,
} from "@fluentui/react-icons";
import { readProps, type ProjectionView, type ProjectionViewProps } from "@gik/react";

export interface FluentSwitchControlProps {
  checked: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function FluentSwitchControl({
  checked,
  onLabel,
  offLabel,
  onToggle,
  disabled = false,
  ariaLabel,
}: FluentSwitchControlProps): React.ReactElement {
  return (
    <Switch
      className="gx-fluent-switch"
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

const FluentSwitch: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const state = readToggleState(node);
  const name = props.str("name");
  return (
    <FluentSwitchControl
      checked={state.checked}
      disabled={props.bool("disabled")}
      onLabel={props.str("onLabel", props.str("label"))}
      offLabel={props.str("offLabel", props.str("label"))}
      ariaLabel={props.str("ariaLabel") || undefined}
      onToggle={(checked) => emit("toggle", {
        checked,
        value: checked ? state.onValue : state.offValue,
        ...(name ? { name } : {}),
      })}
    />
  );
};

const FluentToggle: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const state = readToggleState(node);
  const minWidth = typeof node.props.minWidth === "number" || typeof node.props.minWidth === "string"
    ? node.props.minWidth
    : undefined;
  return (
    <ToggleButton
      className="gx-fluent-toggle"
      checked={state.checked}
      disabled={props.bool("disabled")}
      size="small"
      style={{ minWidth }}
      onClick={() => emit("toggle", {
        checked: !state.checked,
        value: state.checked ? state.offValue : state.onValue,
      })}
    >
      {state.label}
    </ToggleButton>
  );
};

const FluentDropdown: ProjectionView = ({ node, emit }) => {
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

  return (
    <Dropdown
      className="gx-fluent-dropdown"
      open={open}
      button={{
        onPointerDown: (event) => {
          if (event.button === 0 && !open) setOpen(true);
        },
      }}
      onOpenChange={(_, data) => setOpen(data.open)}
      aria-label={props.str("ariaLabel") || undefined}
      placeholder={props.str("placeholder") || undefined}
      value={selected?.label ?? ""}
      selectedOptions={value ? [value] : []}
      onOptionSelect={(_, data) => {
        if (!data.optionValue) return;
        const option = options.find((candidate) => candidate.value === data.optionValue);
        setOpen(false);
        emit("select", { value: data.optionValue, label: option?.label ?? data.optionText });
      }}
    >
      {options.map((option) => <Option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</Option>)}
    </Dropdown>
  );
};

const FluentIconButton: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const iconName = props.str("icon");
  const icon = iconName === "full-screen-minimize"
    ? <FullScreenMinimizeRegular />
    : iconName === "edit"
      ? <EditRegular />
      : <FullScreenMaximizeRegular />;
  const ariaLabel = props.str("ariaLabel");
  return (
    <Button
      className="gx-fluent-icon-button"
      appearance="subtle"
      shape="circular"
      size="small"
      icon={icon}
      disabled={props.bool("disabled")}
      aria-label={ariaLabel}
      title={props.str("title", ariaLabel)}
      onClick={() => emit("press", {})}
    />
  );
};

const FluentButton: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const appearance = props.str("appearance") as "primary" | "secondary" | "subtle" | "transparent" | "outline";
  return (
    <Button
      className="gx-fluent-button"
      appearance={appearance || "secondary"}
      disabled={props.bool("disabled")}
      aria-label={props.str("ariaLabel") || undefined}
      onClick={() => emit("press", {})}
    >
      {props.str("label")}
    </Button>
  );
};

const projectionViews: Record<string, ProjectionView> = {
  button: FluentButton,
  dropdown: FluentDropdown,
  "icon-button": FluentIconButton,
  switch: FluentSwitch,
  toggle: FluentToggle,
};

export default projectionViews;