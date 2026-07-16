import React from "react";
import { Switch, ToggleButton } from "@fluentui/react-components";
import { readProps, type ProjectionView, type ProjectionViewProps } from "@gik/react";

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
    <Switch
      className="gx-fluent-switch"
      checked={state.checked}
      disabled={props.bool("disabled")}
      label={state.label}
      labelPosition="after"
      onChange={(_, data) => emit("toggle", {
        checked: data.checked,
        value: data.checked ? state.onValue : state.offValue,
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