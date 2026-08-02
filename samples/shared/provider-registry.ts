import type { ProjectionView } from "@gik/react";

import copilotC2Leaves from "../blueprints/copilot-c2/native/projection_views/copilotC2Leaves";
import foundryAgentLeaves from "../blueprints/foundry-agent/native/projection_views/foundryAgentLeaves";
import incidentReportExplorerLeaves from "../blueprints/incident-report-explorer/native/projection_views/incidentReportExplorerLeaves";
import incidentReportExplorer2Leaves from "../blueprints/incident-report-explorer-2/native/projection_views/incidentReportExplorer2Leaves";
import incidentReportExplorer3Leaves from "../blueprints/incident-report-explorer-3/native/projection_views/incidentReportExplorer3Leaves";
import liveWorkspaceSocLeaves from "../blueprints/live-workspace-soc/native/projection_views/liveWorkspaceSocLeaves";
import manageBlueprintsLeaves from "../blueprints/manage-blueprints/native/projection_views/manageBlueprintsLeaves";
import portfolioTrackerLeaves from "../blueprints/portfolio-tracker/native/projection_views/portfolioTrackerLeaves";
import samplesOverviewLeaves from "../blueprints/samples-overview/native/projection_views/samplesOverviewLeaves";
import floorLeaves from "../bundles/floor/projection_views/floorLeaves";
import fluentLeaves from "../bundles/fluent/projection_views/fluentLeaves";
import foundryLeaves from "../bundles/foundry/projection_views/foundryLeaves";
import httpProxyLeaves from "../bundles/http-proxy/projection_views/httpProxyLeaves";
import primitiveLeaves from "../bundles/primitive/projection_views/primitiveLeaves";
import providerAuthoringDemoLeaves from "../bundles/provider-authoring-demo/projection_views/providerAuthoringDemoLeaves";
import reactiveDemoLeaves from "../bundles/reactive-demo/projection_views/reactiveDemoLeaves";
import semanticLeaves from "../bundles/semantic/projection_views/semanticLeaves";

const projectionProviders: Record<string, Record<string, ProjectionView>> = {
  "copilot-c2": copilotC2Leaves,
  floor: floorLeaves,
  fluent: fluentLeaves,
  foundry: foundryLeaves,
  "foundry-agent": foundryAgentLeaves,
  "http-proxy": httpProxyLeaves,
  "incident-report-explorer": incidentReportExplorerLeaves,
  "incident-report-explorer-2": incidentReportExplorer2Leaves,
  "incident-report-explorer-3": incidentReportExplorer3Leaves,
  "live-workspace-soc": liveWorkspaceSocLeaves,
  "manage-blueprints": manageBlueprintsLeaves,
  "portfolio-tracker": portfolioTrackerLeaves,
  "provider-authoring-demo": providerAuthoringDemoLeaves,
  primitive: primitiveLeaves,
  "reactive-demo": reactiveDemoLeaves,
  semantic: semanticLeaves,
  "samples-overview": samplesOverviewLeaves,
};

export function resolveBundleProjectionViews(id: string): Record<string, ProjectionView> | undefined {
  return projectionProviders[id];
}
