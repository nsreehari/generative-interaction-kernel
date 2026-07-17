export interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  governance: string;
}

export interface PresentationContext {
  id: string;
  label: string;
  audience: string;
  focus: string;
}

export interface Presentation {
  selectedContext: string;
  revision: number;
  frame: SocPresentationSpec["frame"];
  arrangement: SocPresentationSpec["arrangement"];
  regions: SubstrateRegion[];
  contexts: PresentationContext[];
}

export type SubstrateRegion = "summary" | "intent" | "constraints" | "hypothesis" | "exploration" | "evidence" | "agent-request" | "response" | "authorization" | "causal-record";

export interface SocPresentationSpec {
  frame: "shared" | "mobile" | "laptop" | "pager" | "workstation" | "agent-console";
  arrangement: "war-room" | "inspection" | "decision" | "command" | "glanceable" | "investigation" | "agent";
  regions: SubstrateRegion[];
}

export interface Actor {
  id: string;
  kind: "human" | "agent";
  name: string;
  role: string;
  status: string;
  objective: string;
  authority: string;
  activity?: string;
}

export interface AgentProvider {
  mode: "mock" | "live";
  status: string;
  agentName: string;
  conversationId: string;
  responseId: string;
  lastProvider: "mock" | "live";
  fallbackReason: string;
}

export type ParticipantPresence = "active" | "working" | "waiting" | "input-awaited" | "sleeping" | "complete";

export interface Exploration {
  id: string;
  revision: number;
  status: string;
  question: string;
  windowMinutes: number;
  correlationKey: string;
  safety: string;
}

export interface Evidence {
  id: string;
  actorId: string;
  source: string;
  summary: string;
  confidence: number;
}

export interface Hypothesis {
  statement: string;
  confidence: number;
}

export interface Proposal {
  id: string;
  actorId: string;
  action: string;
  target: string;
  status: string;
  reason?: string;
  fallback?: string;
  sequence?: string[];
  blastRadius?: string;
  payrollDependency?: string;
  reversible?: boolean;
  evidenceReady?: boolean;
}

export interface Authorization {
  status: string;
  requiredRole: string;
  actorId?: string;
}

export interface JournalEntry {
  id: string;
  time: string;
  actorId: string;
  result: string;
  summary: string;
  affected: string[];
  provider?: "mock" | "live";
  agentName?: string;
  conversationId?: string;
  responseId?: string;
  fallbackReason?: string;
}
