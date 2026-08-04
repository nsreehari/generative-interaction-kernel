import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";

import { ActionBoard, actionBoardDefinition } from "./action-board";
import { AnnotatedSourceExcerpt, annotatedSourceExcerptDefinition } from "./annotated-source-excerpt";
import { AttackGraph, attackGraphDefinition } from "./attack-graph";
import { DecisionSummary, decisionSummaryDefinition } from "./decision-summary";
import { EntityConstellation, entityConstellationDefinition } from "./entity-constellation";
import { EvidenceTrail, evidenceTrailDefinition } from "./evidence-trail";
import { MetricComparison, metricComparisonDefinition } from "./metric-comparison";
import { NarrativeSection, narrativeSectionDefinition } from "./narrative-section";
import { SemanticGraph, semanticGraphDefinition } from "./semantic-graph";
import { Sequence, sequenceDefinition } from "./sequence";
import { Timeline, timelineDefinition } from "./timeline";

export const semanticComponentViews: Record<string, ProjectionView> = {
  "action-board": ActionBoard,
  "annotated-source-excerpt": AnnotatedSourceExcerpt,
  "attack-graph": AttackGraph,
  "decision-summary": DecisionSummary,
  "entity-constellation": EntityConstellation,
  "evidence-trail": EvidenceTrail,
  "metric-comparison": MetricComparison,
  "narrative-section": NarrativeSection,
  "semantic-graph": SemanticGraph,
  sequence: Sequence,
  timeline: Timeline,
};

export const semanticComponentDefinitions = {
  "action-board": actionBoardDefinition,
  "annotated-source-excerpt": annotatedSourceExcerptDefinition,
  "attack-graph": attackGraphDefinition,
  "decision-summary": decisionSummaryDefinition,
  "entity-constellation": entityConstellationDefinition,
  "evidence-trail": evidenceTrailDefinition,
  "metric-comparison": metricComparisonDefinition,
  "narrative-section": narrativeSectionDefinition,
  "semantic-graph": semanticGraphDefinition,
  sequence: sequenceDefinition,
  timeline: timelineDefinition,
} as const;

export const semanticComponentCapabilities: Record<string, CapabilityDescriptor> = Object.fromEntries(
  Object.entries(semanticComponentDefinitions).map(([name, definition]) => [name, {
    propsSchema: definition.getSchema(),
    dataProp: definition.dataProp,
    emits: [...definition.events],
  }])
);