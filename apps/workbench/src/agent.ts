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

import type { AuthoredSession } from "./export";
import agentPlaylist from "./agent-playlist.json";

/** The one capability the agent needs: emit a GUP event. GenUIController and GenUIClient both satisfy it. */
export type AgentPort = (node: string, name: string, payload: Record<string, unknown>) => void | Promise<unknown>;

/** One beat of the agent's authoring tour: a narration line plus the artifact it authors. */
export interface AgentStep {
  label: string;
  authored: AuthoredSession;
}

/**
 * A deterministic authoring tour the agent walks once per run so the demo is legible and repeatable.
 * The tour is DATA — authored in agent-playlist.json, not code — so adding/reordering beats is a JSON
 * edit. Only the tour-walking logic below stays native.
 */
export const AGENT_PLAYLIST: AgentStep[] = agentPlaylist as unknown as AgentStep[];

/**
 * The next tour index, or `null` once the last beat has played. The tour is a bounded, one-pass run
 * (not an endless loop): the caller stops when this returns `null` and lands on a "complete" state.
 * Passing `-1` yields the first beat, so a finished tour can replay from the top by resetting to -1.
 */
export function nextAgentIndex(index: number): number | null {
  const next = index + 1;
  return next < AGENT_PLAYLIST.length ? next : null;
}

/** Whether `index` is the last beat of the tour (used to decide whether a fresh Play should replay). */
export function isAgentTourComplete(index: number): boolean {
  return index >= AGENT_PLAYLIST.length - 1;
}
