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

export interface InspectionPresentationContext {
  id: string;
  label: string;
  audience?: string;
  focus?: string;
}

export interface InspectionPresentation {
  selectedContext: string;
  contexts: InspectionPresentationContext[];
}

export interface BlueprintInspectionField {
  label: string;
  value: string;
}

export interface BlueprintInspectionStage {
  kind: string;
  tier: string;
  recipe: string;
  summary: string;
}

export interface BlueprintInspection {
  title: string;
  description: string;
  status: string;
  contextIds: string[];
  selectedContext: string;
  fields: BlueprintInspectionField[];
  stages: BlueprintInspectionStage[];
  resources: BlueprintInspectionField[];
}

export interface InspectionStatus {
  kind: "success" | "info" | "warning" | "error";
  message: string;
}

export interface OrganismInspection {
  participants: InspectionParticipant[];
  presentation?: InspectionPresentation;
  blueprint?: BlueprintInspection;
  timeline?: TimelineItem[];
  status?: InspectionStatus | null;
  selection?: ControlSelection | null;
}
