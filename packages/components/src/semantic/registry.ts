import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import { Argument, argumentDefinition } from "./argument";
import { MeasureSet, measureSetDefinition } from "./measure-set";
import { Milestones, milestonesDefinition } from "./milestones";
import { Narrative, narrativeDefinition } from "./narrative";
import { RelationshipSet, relationshipSetDefinition } from "./relationship-set";
import { WorkSet, workSetDefinition } from "./work-set";
import {
  Decision, EntitySet, EventSeries, EvidenceCase, Process,
  decisionDefinition, entitySetDefinition, eventSeriesDefinition,
  evidenceCaseDefinition, processDefinition,
} from "./canonical-adapters";

export const semanticComponentViews: Record<string, ProjectionView> = {
  argument: Argument,
  "measure-set": MeasureSet,
  milestones: Milestones,
  narrative: Narrative,
  "relationship-set": RelationshipSet,
  "work-set": WorkSet,
  "event-series": EventSeries,
  process: Process,
  "entity-set": EntitySet,
  "evidence-case": EvidenceCase,
  decision: Decision,
};

export const semanticComponentDefinitions = {
  argument: argumentDefinition,
  "measure-set": measureSetDefinition,
  milestones: milestonesDefinition,
  narrative: narrativeDefinition,
  "relationship-set": relationshipSetDefinition,
  "work-set": workSetDefinition,
  "event-series": eventSeriesDefinition,
  process: processDefinition,
  "entity-set": entitySetDefinition,
  "evidence-case": evidenceCaseDefinition,
  decision: decisionDefinition,
} as const;

export const semanticComponentCapabilities: Record<string, CapabilityDescriptor> = Object.fromEntries(
  Object.entries(semanticComponentDefinitions).map(([name, definition]) => [name, {
    propsSchema: definition.getSchema(),
    dataProp: definition.dataProp,
    emits: [...definition.events],
  }])
);