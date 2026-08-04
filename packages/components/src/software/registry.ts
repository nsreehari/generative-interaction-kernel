import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";
import { SourceComparison, SourceFindings, sourceComparisonDefinition, sourceFindingsDefinition } from "./source-analysis";

export const softwareComponentViews: Record<string, ProjectionView> = { "source-findings": SourceFindings, "source-comparison": SourceComparison };
export const softwareComponentDefinitions = { "source-findings": sourceFindingsDefinition, "source-comparison": sourceComparisonDefinition } as const;
export const softwareComponentCapabilities: Record<string, CapabilityDescriptor> = Object.fromEntries(Object.entries(softwareComponentDefinitions).map(([name, definition]) => [name, { propsSchema: definition.getSchema(), dataProp: definition.dataProp, emits: [...definition.events] }]));