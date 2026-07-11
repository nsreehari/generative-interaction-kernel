import { AGENT_PLAYLIST, isAgentTourComplete, nextAgentIndex } from "./agent";
import { authoredApplyPayload } from "./bridge";

export interface AgentLoopClient {
  get(path: string): unknown;
  subscribe(listener: () => void): () => void;
  emit(node: string, name: string, payload?: Record<string, unknown>): void | Promise<unknown>;
}

export interface AgentLoopOptions {
  intervalMs?: number;
}

/**
 * Run the bounded authoring tour against any client that can read chrome state and emit GUP events.
 * This is the same loop whether the agent is co-located with the browser or running inside a Node host.
 */
export function startAgentLoop(client: AgentLoopClient, opts: AgentLoopOptions = {}): () => void {
  const intervalMs = opts.intervalMs ?? 1800;
  let running = Boolean(client.get("workbench.agentRunning"));
  let agentIndex = Number(client.get("workbench.agentStep")) || 0;
  let lastAgentStepSeq = Number(client.get("workbench.agentStepSeq")) || 0;

  const advance = () => {
    const next = nextAgentIndex(agentIndex);
    if (next === null) {
      void client.emit("chrome-root", "agentDone", {});
      return;
    }
    agentIndex = next;
    const step = AGENT_PLAYLIST[next];
    void client.emit("chrome-root", "importApply", authoredApplyPayload(step.authored));
    void client.emit("chrome-root", "agentAdvance", { step: next, label: step.label });
  };

  const onChange = () => {
    const wasRunning = running;
    running = Boolean(client.get("workbench.agentRunning"));
    if (running && !wasRunning && isAgentTourComplete(agentIndex)) {
      agentIndex = -1;
    }
    const seq = Number(client.get("workbench.agentStepSeq")) || 0;
    if (seq !== lastAgentStepSeq) {
      lastAgentStepSeq = seq;
      advance();
    }
  };

  const unsubscribe = client.subscribe(onChange);
  const timer = setInterval(() => {
    if (running) advance();
  }, intervalMs);

  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}