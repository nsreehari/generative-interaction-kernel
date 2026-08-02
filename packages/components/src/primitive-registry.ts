import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import { Chart, chartDefinition } from "./chart";
import { EditableTable, editableTableDefinition } from "./editable-table";
import { Form, formDefinition } from "./form";
import { GrowingContainerPrimitive, growingContainerDefinition } from "./growing-container";
import { TimerButton, timerButtonDefinition } from "./timer-button";

export const primitiveComponentViews: Record<string, ProjectionView> = {
  chart: Chart,
  "editable-table": EditableTable,
  form: Form,
  "growing-container": GrowingContainerPrimitive,
  "timer-button": TimerButton,
};

export const primitiveComponentDefinitions = {
  chart: chartDefinition,
  "editable-table": editableTableDefinition,
  form: formDefinition,
  "growing-container": growingContainerDefinition,
  "timer-button": timerButtonDefinition,
} as const;

export const primitiveComponentCapabilities: Record<string, CapabilityDescriptor> = Object.fromEntries(
  Object.entries(primitiveComponentDefinitions).map(([name, definition]) => [name, {
    propsSchema: definition.getSchema(),
    ...(definition.dataProp ? { dataProp: definition.dataProp } : {}),
    ...(definition.slots ? { slots: [...definition.slots] } : {}),
    emits: [...definition.events],
  }])
);