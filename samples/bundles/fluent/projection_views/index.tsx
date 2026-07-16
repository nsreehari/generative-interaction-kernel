import React from "react";
import { Switch, ToggleButton } from "@fluentui/react-components";
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
  return (
    <FluentSwitchControl
      checked={state.checked}
      disabled={props.bool("disabled")}
      onLabel={props.str("onLabel", props.str("label"))}
      offLabel={props.str("offLabel", props.str("label"))}
      onToggle={(checked) => emit("toggle", {
        checked,
        value: checked ? state.onValue : state.offValue,
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

const projectionViews: Record<string, ProjectionView> = {
  switch: FluentSwitch,
  toggle: FluentToggle,
};

export default projectionViews;