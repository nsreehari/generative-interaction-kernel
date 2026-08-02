import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import {
  FluentButton,
  FluentIconButton,
  fluentButtonDefinition,
  fluentIconButtonDefinition,
} from "./fluent/FluentButtons";
import {
  FluentDropdown,
  FluentSwitch,
  FluentToggle,
  fluentDropdownDefinition,
  fluentSwitchDefinition,
  fluentToggleDefinition,
} from "./fluent/FluentInputs";

export const fluentComponentViews: Record<string, ProjectionView> = {
  button: FluentButton,
  dropdown: FluentDropdown,
  "icon-button": FluentIconButton,
  switch: FluentSwitch,
  toggle: FluentToggle,
};

export const fluentComponentDefinitions = {
  button: fluentButtonDefinition,
  dropdown: fluentDropdownDefinition,
  "icon-button": fluentIconButtonDefinition,
  switch: fluentSwitchDefinition,
  toggle: fluentToggleDefinition,
} as const;

export const fluentComponentCapabilities: Record<string, CapabilityDescriptor> = Object.fromEntries(
  Object.entries(fluentComponentDefinitions).map(([name, definition]) => [name, {
    propsSchema: definition.getSchema(),
    emits: [...definition.events],
  }]),
);
