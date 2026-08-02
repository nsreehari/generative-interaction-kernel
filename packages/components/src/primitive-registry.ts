import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import { Chart, chartDefinition } from "./chart";
import { GrowingContainerPrimitive, growingContainerDefinition } from "./growing-container";
import { TimerButton, timerButtonDefinition } from "./timer-button";

export const primitiveComponentViews: Record<string, ProjectionView> = {
  chart: Chart,
  "growing-container": GrowingContainerPrimitive,
  "timer-button": TimerButton,
};

export const primitiveComponentDefinitions = {
  chart: chartDefinition,
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