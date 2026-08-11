import * as cachedIncidentReportExplorer from "../blueprints/cached-incident-report-explorer/native/effect_handlers/cachedIncidentReportExplorerEffectHandlers";
import * as cachedIncidentReportExplorer2 from "../blueprints/cached-incident-report-explorer-2/native/effect_handlers/cachedIncidentReportExplorer2EffectHandlers";
import * as cachedIncidentReportExplorer3 from "../blueprints/cached-incident-report-explorer-3/native/effect_handlers/cachedIncidentReportExplorer3EffectHandlers";
import * as incidentReportExplorer from "../blueprints/incident-report-explorer/native/effect_handlers/incidentReportExplorerEffectHandlers";
import * as incidentReportExplorer1a from "../blueprints/incident-report-explorer-1a/native/effect_handlers/incidentReportExplorer1aEffectHandlers";
import * as incidentReportExplorer2 from "../blueprints/incident-report-explorer-2/native/effect_handlers/incidentReportExplorer2EffectHandlers";
import * as incidentReportExplorer3 from "../blueprints/incident-report-explorer-3/native/effect_handlers/incidentReportExplorer3EffectHandlers";
import { getSampleBlueprintCatalog } from "./blueprint-catalog";
import {
  portableSampleNativeEffects,
  type SampleNativeEffects,
} from "./native-effects";

const browserSampleNativeEffects: Readonly<Record<string, SampleNativeEffects>> = {
  ...portableSampleNativeEffects,
  "cached-incident-report-explorer": cachedIncidentReportExplorer,
  "cached-incident-report-explorer-2": cachedIncidentReportExplorer2,
  "cached-incident-report-explorer-3": cachedIncidentReportExplorer3,
  "incident-report-explorer": incidentReportExplorer,
  "incident-report-explorer-1a": incidentReportExplorer1a,
  "incident-report-explorer-2": incidentReportExplorer2,
  "incident-report-explorer-3": incidentReportExplorer3,
};

export function resolveBrowserSampleNativeEffects(id: string): SampleNativeEffects | undefined {
  const nativeId = getSampleBlueprintCatalog().nativeFrom[id] ?? id;
  return browserSampleNativeEffects[nativeId];
}