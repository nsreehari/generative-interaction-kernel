import {
  materializeBlueprint,
  type ExternalContext,
  type BlueprintArtifact,
} from "@gik/blueprint";
import {
  openBlueprint,
  type BlueprintRuntime,
} from "@gik/controlface/blueprint";
import fourLayersBlueprint from "../blueprints/4layers/blueprint.json";
import briefingBlueprint from "../blueprints/briefing/blueprint.json";
import copilotC2Blueprint from "../blueprints/copilot-c2/blueprint.json";
import foundryAgentNoCellsBlueprint from "../blueprints/foundry-agent-no-cells/blueprint.json";
import foundryAgentBlueprint from "../blueprints/foundry-agent/blueprint.json";
import incidentReportExplorerBlueprint from "../blueprints/incident-report-explorer/blueprint.json";
import incidentReportExplorer2Blueprint from "../blueprints/incident-report-explorer-2/blueprint.json";
import liveCardsBlueprint from "../blueprints/live-cards/blueprint.json";
import liveWorkspaceSocBlueprint from "../blueprints/live-workspace-soc/blueprint.json";
import manageBlueprintsBlueprint from "../blueprints/manage-blueprints/blueprint.json";
import portfolioTrackerTwoTiersBlueprint from "../blueprints/portfolio-tracker-2tiers/blueprint.json";
import portfolioTrackerBlueprint from "../blueprints/portfolio-tracker/blueprint.json";
import samplesOverviewBlueprint from "../blueprints/samples-overview/blueprint.json";
import vocabularyLoweringBlueprint from "../blueprints/vocabulary-lowering/blueprint.json";
import { applyHostConfig } from "./host-config";

export const sampleBlueprints: Readonly<Record<string, BlueprintArtifact>> = {
  "4layers": fourLayersBlueprint as unknown as BlueprintArtifact,
  briefing: briefingBlueprint as unknown as BlueprintArtifact,
  "copilot-c2": copilotC2Blueprint as unknown as BlueprintArtifact,
  "foundry-agent": foundryAgentBlueprint as unknown as BlueprintArtifact,
  "foundry-agent-no-cells": foundryAgentNoCellsBlueprint as unknown as BlueprintArtifact,
  "incident-report-explorer": incidentReportExplorerBlueprint as unknown as BlueprintArtifact,
  "incident-report-explorer-2": incidentReportExplorer2Blueprint as unknown as BlueprintArtifact,
  "live-cards": liveCardsBlueprint as unknown as BlueprintArtifact,
  "live-workspace-soc": liveWorkspaceSocBlueprint as unknown as BlueprintArtifact,
  "manage-blueprints": manageBlueprintsBlueprint as unknown as BlueprintArtifact,
  "portfolio-tracker": portfolioTrackerBlueprint as unknown as BlueprintArtifact,
  "portfolio-tracker-2tiers": portfolioTrackerTwoTiersBlueprint as unknown as BlueprintArtifact,
  "samples-overview": samplesOverviewBlueprint as unknown as BlueprintArtifact,
  "vocabulary-lowering": vocabularyLoweringBlueprint as unknown as BlueprintArtifact,
};

export function hasSampleBlueprint(id: string): boolean {
  return id in sampleBlueprints;
}

export function resolveSampleBlueprintSource(id: string): BlueprintArtifact {
  const blueprint = sampleBlueprints[id];
  if (!blueprint) throw new Error(`Unknown Blueprint '${id}'`);
  return applyHostConfig(blueprint);
}

export function openSampleBlueprint(
  id: string,
  externalContext?: ExternalContext,
): BlueprintRuntime {
  const materialized = materializeBlueprint({
    blueprint: resolveSampleBlueprintSource(id),
    externalContext,
  });
  return openBlueprint(materialized.payload.terminalBlueprint);
}