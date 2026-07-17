import { AgentEnvelope } from "./AgentEnvelope";
import { BlueprintInspector } from "./BlueprintInspector";
import { JournalRail } from "./JournalRail";
import { LiveWorkspaceSocBody } from "./LiveWorkspaceSocBody";
import { OperationalView } from "./OperationalView";
import { Participants } from "./Participants";
import { RuntimeProjection } from "./RuntimeProjection";
import { SharedSummary } from "./SharedSummary";
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
  "shared-summary": SharedSummary,
  "agent-envelope": AgentEnvelope,
  "operational-view": OperationalView,
};
