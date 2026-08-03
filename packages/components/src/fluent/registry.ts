import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import {
  FluentButton,
  fluentButtonDefinition,
} from "./FluentButtons";
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
} from "./FluentBasicControls";
import {
  FluentDropdown,
  FluentSwitch,
  FluentToggle,
  fluentDropdownDefinition,
  fluentSwitchDefinition,
  fluentToggleDefinition,
} from "./FluentInputs";
import {
  FluentDataGrid,
  FluentList,
  FluentTable,
  fluentDataGridDefinition,
  fluentListDefinition,
  fluentTableDefinition,
} from "./FluentDataControls";
import { FluentDialog, fluentDialogDefinition } from "./FluentDialog";
import {
  FluentBadge,
  FluentPersona,
  FluentSpinner,
  fluentBadgeDefinition,
  fluentPersonaDefinition,
  fluentSpinnerDefinition,
} from "./FluentDisplayControls";

export const fluentComponentViews: Record<string, ProjectionView> = {
  badge: FluentBadge,
  button: FluentButton,
  chips: FluentChips,
  "data-grid": FluentDataGrid,
  dialog: FluentDialog,
  dropdown: FluentDropdown,
  list: FluentList,
  persona: FluentPersona,
  searchbox: FluentSearchbox,
  spinner: FluentSpinner,
  switch: FluentSwitch,
  table: FluentTable,
  "tab-bar": FluentTabBar,
  "text-field": FluentTextField,
  textarea: FluentTextarea,
  toggle: FluentToggle,
};

export const fluentComponentDefinitions = {
  badge: fluentBadgeDefinition,
  button: fluentButtonDefinition,
  chips: fluentChipsDefinition,
  "data-grid": fluentDataGridDefinition,
  dialog: fluentDialogDefinition,
  dropdown: fluentDropdownDefinition,
  list: fluentListDefinition,
  persona: fluentPersonaDefinition,
  searchbox: fluentSearchboxDefinition,
  spinner: fluentSpinnerDefinition,
  switch: fluentSwitchDefinition,
  table: fluentTableDefinition,
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
