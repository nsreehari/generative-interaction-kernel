import type { ControlSelection, FocusRef, TimelineItem } from "./control-focus";

export type ParticipantKind = "human" | "agent";

export type ParticipantStatus =
  | "available"
  | "active"
  | "working"
  | "waiting"
  | "input-required"
  | "completed"
  | "inactive"
  | "error";

export interface ParticipantToggleSetting {
  id: string;
  kind: "toggle";
  label: string;
  value: string;
  offLabel: string;
  offValue: string;
  onLabel: string;
  onValue: string;
  status?: "ready" | "pending" | "error";
  message?: string;
}

export type ParticipantSetting = ParticipantToggleSetting;

export interface InspectionParticipant {
  id: string;
  kind: ParticipantKind;
  name: string;
  role?: string;
  status: ParticipantStatus;
  capabilities?: string[];
  focusRef?: FocusRef;
  settings?: ParticipantSetting[];
}

export interface ParticipantConfigurationRequest {
  participantId: string;
  settingId: string;
  value: string;
}

export interface OrganismInspection {
  participants: InspectionParticipant[];
  timeline?: TimelineItem[];
  selection?: ControlSelection | null;
}
