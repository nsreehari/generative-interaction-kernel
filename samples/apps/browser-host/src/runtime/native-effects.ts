import type { EffectHandlerMap, LoadBundleOptions } from "@gik/react";
import * as backendOrderProcessing from "../../../../blueprints/backend-order-processing/native/effect_handlers/backendOrderProcessingEffectHandlers";
import * as copilotC2 from "../../../../blueprints/copilot-c2/native/effect_handlers/copilotC2EffectHandlers";
import * as foundryAgent from "../../../../blueprints/foundry-agent/native/effect_handlers/foundryAgentEffectHandlers";
import * as incidentReportExplorer from "../../../../blueprints/incident-report-explorer/native/effect_handlers/incidentReportExplorerEffectHandlers";
import * as incidentReportExplorer1a from "../../../../blueprints/incident-report-explorer-1a/native/effect_handlers/incidentReportExplorer1aEffectHandlers";
import * as incidentReportExplorer2 from "../../../../blueprints/incident-report-explorer-2/native/effect_handlers/incidentReportExplorer2EffectHandlers";
import * as incidentReportExplorer3 from "../../../../blueprints/incident-report-explorer-3/native/effect_handlers/incidentReportExplorer3EffectHandlers";
import * as liveWorkspaceSoc from "../../../../blueprints/live-workspace-soc/native/effect_handlers/liveWorkspaceSocEffectHandlers";
import * as manageBlueprints from "../../../../blueprints/manage-blueprints/native/effect_handlers/manageBlueprintsEffectHandlers";
import * as portfolioTracker from "../../../../blueprints/portfolio-tracker/native/effect_handlers/portfolioTrackerEffectHandlers";
import { getSampleBlueprintCatalog } from "../../../../catalog/blueprint-catalog";

export interface SampleNativeEffects {
  default: EffectHandlerMap;
  hydrateState?: (state: Record<string, unknown>) => void;
  wrapOrchestrator?: (
    next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>,
  ) => NonNullable<LoadBundleOptions["wrapOrchestrator"]>;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const copilotC2BrowserEffects: SampleNativeEffects = {
  default: copilotC2.default,
  hydrateState: (state) => copilotC2.hydrateState(state, browserStorage()),
  wrapOrchestrator: (next) => copilotC2.wrapOrchestrator(next, browserStorage()),
};

const portfolioTrackerBrowserEffects: SampleNativeEffects = {
  default: portfolioTracker.default,
  hydrateState: (state) => portfolioTracker.hydrateState(state, browserStorage()),
  wrapOrchestrator: (next) => portfolioTracker.wrapOrchestrator(next, browserStorage()),
};

const browserSampleNativeEffects: Readonly<Record<string, SampleNativeEffects>> = {
  "backend-order-processing": backendOrderProcessing,
  "incident-report-explorer": incidentReportExplorer,
  "incident-report-explorer-1a": incidentReportExplorer1a,
  "incident-report-explorer-2": incidentReportExplorer2,
  "incident-report-explorer-3": incidentReportExplorer3,
  "copilot-c2": copilotC2BrowserEffects,
  "foundry-agent": foundryAgent,
  "live-workspace-soc": liveWorkspaceSoc,
  "manage-blueprints": manageBlueprints,
  "portfolio-tracker": portfolioTrackerBrowserEffects,
};

export function resolveBrowserSampleNativeEffects(id: string): SampleNativeEffects | undefined {
  const nativeId = getSampleBlueprintCatalog().nativeFrom[id] ?? id;
  return browserSampleNativeEffects[nativeId];
}