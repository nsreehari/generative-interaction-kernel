import { JournalRail } from "./JournalRail";
import { LiveWorkspaceSocBody } from "./LiveWorkspaceSocBody";
import { Participants } from "./Participants";
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
  socPresentationSpec,
} from "./helpers";
export type { JournalEntry, SocPresentationSpec } from "./types";

export default {
  "workspace-shell": WorkspaceShell,
  header: WorkspaceHeader,
  journal: JournalRail,
  participants: Participants,
  "workspace-body": LiveWorkspaceSocBody,
};
