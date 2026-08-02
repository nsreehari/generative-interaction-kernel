import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import {
  FluentButton,
  FluentIconButton,
  fluentButtonDefinition,
  fluentIconButtonDefinition,
} from "./fluent/FluentButtons";
import {
  FluentChips,
  FluentSearchbox,
  FluentTabBar,
  FluentTextField,
  FluentTextarea,
  fluentChipsDefinition,
  fluentSearchboxDefinition,
  fluentTabBarDefinition,
  fluentTextFieldDefinition,
  fluentTextareaDefinition,
} from "./fluent/FluentBasicControls";
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
  chips: FluentChips,
  dropdown: FluentDropdown,
  "icon-button": FluentIconButton,
  searchbox: FluentSearchbox,
  switch: FluentSwitch,
  "tab-bar": FluentTabBar,
  "text-field": FluentTextField,
  textarea: FluentTextarea,
  toggle: FluentToggle,
};

export const fluentComponentDefinitions = {
  button: fluentButtonDefinition,
  chips: fluentChipsDefinition,
  dropdown: fluentDropdownDefinition,
  "icon-button": fluentIconButtonDefinition,
  searchbox: fluentSearchboxDefinition,
  switch: fluentSwitchDefinition,
  "tab-bar": fluentTabBarDefinition,
  "text-field": fluentTextFieldDefinition,
  textarea: fluentTextareaDefinition,
  toggle: fluentToggleDefinition,
} as const;

export const fluentComponentCapabilities: Record<string, CapabilityDescriptor> = Object.fromEntries(
  Object.entries(fluentComponentDefinitions).map(([name, definition]) => [name, {
    propsSchema: definition.getSchema(),
    ...(definition.dataProp ? { dataProp: definition.dataProp } : {}),
    emits: [...definition.events],
  }]),
);
