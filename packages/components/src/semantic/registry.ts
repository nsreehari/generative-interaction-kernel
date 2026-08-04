import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import { MeasureSet, measureSetDefinition } from "./measure-set";
import { Milestones, milestonesDefinition } from "./milestones";
import { Narrative, narrativeDefinition } from "./narrative";
import { RelationshipSet, relationshipSetDefinition } from "./relationship-set";
import { WorkSet, workSetDefinition } from "./work-set";
import {
  AttackPath, Decision, EntitySet, EventSeries, EvidenceCase, Process, SourceComparison, SourceFindings,
  attackPathDefinition, decisionDefinition, entitySetDefinition, eventSeriesDefinition,
  evidenceCaseDefinition, processDefinition, sourceComparisonDefinition, sourceFindingsDefinition,
} from "./canonical-adapters";

export const semanticComponentViews: Record<string, ProjectionView> = {
  "measure-set": MeasureSet,
  milestones: Milestones,
  narrative: Narrative,
  "relationship-set": RelationshipSet,
  "work-set": WorkSet,
  "event-series": EventSeries,
  process: Process,
  "entity-set": EntitySet,
  "attack-path": AttackPath,
  "evidence-case": EvidenceCase,
  decision: Decision,
  "source-findings": SourceFindings,
  "source-comparison": SourceComparison,
};

export const semanticComponentDefinitions = {
  "measure-set": measureSetDefinition,
  milestones: milestonesDefinition,
  narrative: narrativeDefinition,
  "relationship-set": relationshipSetDefinition,
  "work-set": workSetDefinition,
  "event-series": eventSeriesDefinition,
  process: processDefinition,
  "entity-set": entitySetDefinition,
  "attack-path": attackPathDefinition,
  "evidence-case": evidenceCaseDefinition,
  decision: decisionDefinition,
  "source-findings": sourceFindingsDefinition,
  "source-comparison": sourceComparisonDefinition,
} as const;

export const semanticComponentCapabilities: Record<string, CapabilityDescriptor> = Object.fromEntries(
  Object.entries(semanticComponentDefinitions).map(([name, definition]) => [name, {
    propsSchema: definition.getSchema(),
    dataProp: definition.dataProp,
    emits: [...definition.events],
  }])
);