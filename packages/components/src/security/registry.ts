import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import { AttackPath, attackPathDefinition } from "./attack-path";

export const securityComponentViews: Record<string, ProjectionView> = { "attack-path": AttackPath };
export const securityComponentDefinitions = { "attack-path": attackPathDefinition } as const;
export const securityComponentCapabilities: Record<string, CapabilityDescriptor> = Object.fromEntries(Object.entries(securityComponentDefinitions).map(([name, definition]) => [name, { propsSchema: definition.getSchema(), dataProp: definition.dataProp, emits: [...definition.events] }]));