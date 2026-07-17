import { BlueprintInspector } from "./BlueprintInspector";
import { JournalRail } from "./JournalRail";
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
import { Participants } from "./Participants";
import { PresentationLayout } from "./PresentationLayout";
import { RuntimeProjection } from "./RuntimeProjection";
import { SubstrateChrome } from "./SubstrateChrome";
import { ViewpointHeader } from "./ViewpointHeader";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceShell } from "./WorkspaceShell";

export {
  SOC_FOCUS_TARGETS,
  isActorSelected,
  isCausallyAffected,
  participantPresence,
  selectionTargetsActor,
  selectionTargetsRecord,
  socJournalSelection,
  socJournalTimelineItem,
} from "./helpers";
export type { JournalEntry, SocPresentationSpec } from "./types";

export default {
  "workspace-shell": WorkspaceShell,
  header: WorkspaceHeader,
  journal: JournalRail,
  participants: Participants,
  "workspace-body": LiveWorkspaceSocBody,
  "substrate-chrome": SubstrateChrome,
  "blueprint-inspector": BlueprintInspector,
  "runtime-projection": RuntimeProjection,
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
