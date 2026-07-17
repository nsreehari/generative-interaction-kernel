import { LiveWorkspaceSocBody } from "./LiveWorkspaceSocBody";
import {
  AuthorizationRegion,
  AgentRequestRegion,
  CausalRecordRegion,
  ConstraintsRegion,
  EvidenceRegion,
  ExplorationRegion,
  HypothesisRegion,
  IntentRegion,
  ResponseRegion,
} from "./OperationalRegions";
import { PresentationLayout } from "./PresentationLayout";
import { RuntimeProjection } from "./RuntimeProjection";
import { RegionSurface } from "./RegionSurface";
import { SubstrateChrome } from "./SubstrateChrome";
import { ViewpointHeader } from "./ViewpointHeader";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceShell } from "./WorkspaceShell";

export * from "./helpers";
export type { JournalEntry, SocPresentationSpec } from "./types";

export default {
  "workspace-shell": WorkspaceShell,
  header: WorkspaceHeader,
  "workspace-body": LiveWorkspaceSocBody,
  "substrate-chrome": SubstrateChrome,
  "runtime-projection": RuntimeProjection,
  "region-surface": RegionSurface,
  "viewpoint-header": ViewpointHeader,
  "presentation-layout": PresentationLayout,
  "intent-region": IntentRegion,
  "constraints-region": ConstraintsRegion,
  "hypothesis-region": HypothesisRegion,
  "exploration-region": ExplorationRegion,
  "evidence-region": EvidenceRegion,
  "agent-request-region": AgentRequestRegion,
  "response-region": ResponseRegion,
  "authorization-region": AuthorizationRegion,
  "causal-record-region": CausalRecordRegion,
};
