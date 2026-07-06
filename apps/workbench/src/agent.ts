// Slice 4 — the agent writer. The workbench's third purpose: an agent keeps authoring and the user
// watches it happen live in the playground. Crucially, the agent is NOT a privileged path — it is
// "just another client emitting events" (the GUP thesis). It depends only on an `AgentPort` (the
// `emit(node, name, payload)` surface that BOTH GenUIController in-process and GenUIClient over a
// transport implement), so the very same agent can drive the chrome locally or across an SSE wire.
//
// This agent authors by replaying a curated tour of authored sessions (the Slice 3 artifact) through
// the chrome's `importApply` seam — exactly the events a human import would fire. So the whole
// pipeline (interaction -> presentation -> UI) re-runs per step and the guest re-renders, with no
// special-casing anywhere downstream.

import type { InteractionKind, PresentationContext, PresentationEdits } from "../../../interaction/src/index";
import type { AuthoredSession } from "./export";

/** The one capability the agent needs: emit a GUP event. GenUIController and GenUIClient both satisfy it. */
export type AgentPort = (node: string, name: string, payload: Record<string, unknown>) => void | Promise<unknown>;

/** One beat of the agent's authoring tour: a narration line plus the artifact it authors. */
export interface AgentStep {
  label: string;
  authored: AuthoredSession;
}

const NO_EDITS: PresentationEdits = { disabled: [], priority: {}, disclosure: {}, order: [] };

function authored(
  interaction: InteractionKind,
  subject: string,
  surface: PresentationContext["surface"],
  edits: PresentationEdits = NO_EDITS
): AuthoredSession {
  return {
    gup: "0.1",
    kind: "authored-session",
    interaction: { interaction, subject },
    context: { surface },
    edits,
  };
}

/** A deterministic authoring tour the agent loops through so the demo is legible and repeatable. */
export const AGENT_PLAYLIST: AgentStep[] = [
  { label: "Investigating an incident", authored: authored("investigate", "incident", "desktop") },
  { label: "Comparing vendor options", authored: authored("compare", "vendors", "desktop") },
  { label: "Monitoring the fleet", authored: authored("monitor", "fleet", "desktop") },
  {
    label: "Re-authoring the comparison for mobile (pinning the recommendation)",
    authored: authored("compare", "vendors", "mobile", {
      disabled: [],
      priority: { recommendation: "primary" },
      disclosure: {},
      order: ["recommendation"],
    }),
  },
];

/** The next tour index, wrapping at the end so the agent runs indefinitely while playing. */
export function nextAgentIndex(index: number): number {
  return (index + 1) % AGENT_PLAYLIST.length;
}
