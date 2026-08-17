import type { Json } from "@gik/kernel";
import type { EffectHandlerMap, LoadBundleOptions } from "@gik/react";

export const copilotC2StateStorageKey = "gik.copilot-c2.state.v1";

const PERSISTED_COPILOT_C2_KEYS = [
  "mcpServer",
  "workingDir",
  "model",
  "sourceRoots",
  "selectedSourceRootId",
  "agents",
  "agentActivities",
  "selectedAgentId",
  "draft",
  "runs",
  "selectedRunId",
  "currentRun",
] as const;

export function readStoredCopilotC2State(
  storage: Pick<Storage, "getItem"> | null
): Record<string, Json> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(copilotC2StateStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { copilotC2?: unknown };
    if (!parsed || typeof parsed !== "object" || !parsed.copilotC2 || typeof parsed.copilotC2 !== "object" || Array.isArray(parsed.copilotC2)) {
      return null;
    }
    const source = parsed.copilotC2 as Record<string, Json>;
    return Object.fromEntries(
      PERSISTED_COPILOT_C2_KEYS
        .filter((key) => key in source)
        .map((key) => [key, source[key]])
    ) as Record<string, Json>;
  } catch {
    return null;
  }
}

export function writeStoredCopilotC2State(
  copilotC2: Record<string, Json>,
  storage: Pick<Storage, "setItem"> | null
): void {
  if (!storage) return;
  try {
    const persisted = Object.fromEntries(
      PERSISTED_COPILOT_C2_KEYS
        .filter((key) => key in copilotC2)
        .map((key) => [key, copilotC2[key]])
    );
    storage.setItem(copilotC2StateStorageKey, JSON.stringify({
      savedAt: new Date().toISOString(),
      copilotC2: persisted,
    }));
  } catch {
    // Browser storage is an optional durability layer; state updates must still succeed.
  }
}

export function hydrateState(
  state: Record<string, unknown>,
  storage: Pick<Storage, "getItem"> | null
): void {
  const stored = readStoredCopilotC2State(storage);
  if (stored === null) return;
  const copilotC2 = state.copilotC2;
  if (!copilotC2 || typeof copilotC2 !== "object" || Array.isArray(copilotC2)) return;
  Object.assign(copilotC2, stored);
}

export function wrapOrchestrator(
  next: NonNullable<LoadBundleOptions["wrapOrchestrator"]>,
  storage: Pick<Storage, "setItem"> | null,
): NonNullable<LoadBundleOptions["wrapOrchestrator"]> {
  return (fallback, state) => {
    const apply = state.apply.bind(state);
    state.apply = (ops) => {
      apply(ops);
      const durableChange = ops.some((op) =>
        op.path === "copilotC2"
        || PERSISTED_COPILOT_C2_KEYS.some((key) => op.path === `copilotC2.${key}` || op.path.startsWith(`copilotC2.${key}.`))
      );
      if (!durableChange) return;
      const copilotC2 = state.get("copilotC2");
      if (copilotC2 && typeof copilotC2 === "object" && !Array.isArray(copilotC2)) {
        writeStoredCopilotC2State(copilotC2 as Record<string, Json>, storage);
      }
    };
    return next(fallback, state);
  };
}

const effectHandlers: EffectHandlerMap = {};
export default effectHandlers;
