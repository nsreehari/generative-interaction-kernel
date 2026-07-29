import { evalAsyncJsonata } from "@gik/evaluators";
import type { Json } from "@gik/kernel";
import { setOp, type EffectHandlerMap } from "@gik/react";

export interface DemoRunnerEvent {
  gik: "0.1";
  type: "event";
  payload: {
    node: string;
    name: string;
    payload?: Record<string, Json>;
  };
}

interface SequenceEntryBase {
  id: string;
  participantId?: string;
  shortDescription?: string;
  longDescription?: string;
}

interface ActEntry extends SequenceEntryBase {
  kind: "act";
  participantId: string;
  event: DemoRunnerEvent;
}

interface WaitEntry extends SequenceEntryBase {
  kind: "wait";
  when: string;
}

interface ObserveEntry extends SequenceEntryBase {
  kind: "observe";
  select: Record<string, string>;
}

type SequenceEntry = ActEntry | WaitEntry | ObserveEntry;

interface Scenario {
  id: string;
  shortDescription: string;
  resetBlueprintStateAtStart?: boolean;
  sequence: SequenceEntry[];
}

interface JournalEntry {
  id: string;
  entryId: string;
  kind: SequenceEntry["kind"];
  participantId?: string;
  title: string;
  description?: string;
  status: "running" | "completed" | "failed";
  event?: DemoRunnerEvent;
  condition?: string;
  observations?: Record<string, Json>;
  sequence: number;
}

interface ExecutionState {
  resetBlueprintStateAtStartApplied: boolean;
  completedEntryIds: string[];
  journal: JournalEntry[];
}

export interface DemoRunnerExpressionScope {
  state?: Json;
  context?: Json;
}

export interface DemoRunnerEffectCallbacksV1 {
  runTransition(event: DemoRunnerEvent): void | Promise<void>;
  getExpressionScope(): DemoRunnerExpressionScope | Promise<DemoRunnerExpressionScope>;
  waitUntil(
    predicate: (scope: DemoRunnerExpressionScope) => boolean | Promise<boolean>,
  ): Promise<DemoRunnerExpressionScope>;
  setExternalContext(values: Record<string, Json>): void | Promise<void>;
}

function record(value: Json): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
}

function scenarioFrom(value: Json): Scenario | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as unknown as Scenario;
  return typeof candidate.id === "string" && Array.isArray(candidate.sequence) ? candidate : undefined;
}

function executionFrom(value: Json): ExecutionState {
  const candidate = record(value);
  return {
    resetBlueprintStateAtStartApplied: candidate.resetBlueprintStateAtStartApplied === true,
    completedEntryIds: Array.isArray(candidate.completedEntryIds)
      ? candidate.completedEntryIds.map(String)
      : [],
    journal: Array.isArray(candidate.journal) ? candidate.journal as unknown as JournalEntry[] : [],
  };
}

function setJournalStatus(
  execution: ExecutionState,
  scenario: Scenario,
  entry: SequenceEntry,
  sequence: number,
  status: JournalEntry["status"],
  observations?: Record<string, Json>,
): void {
  const journalEntry: JournalEntry = {
    id: `${scenario.id}:${entry.id}`,
    entryId: entry.id,
    kind: entry.kind,
    ...(entry.participantId ? { participantId: entry.participantId } : {}),
    title: entry.shortDescription ?? entry.id,
    ...(entry.longDescription ? { description: entry.longDescription } : {}),
    status,
    ...(entry.kind === "act" ? { event: structuredClone(entry.event) } : {}),
    ...(entry.kind === "wait" ? { condition: entry.when } : {}),
    ...(observations ? { observations } : {}),
    sequence,
  };
  const index = execution.journal.findIndex((candidate) => candidate.id === journalEntry.id);
  if (index < 0) execution.journal.push(journalEntry);
  else execution.journal[index] = journalEntry;
}

async function evaluate(expression: string, scope: DemoRunnerExpressionScope): Promise<Json> {
  return await evalAsyncJsonata(expression, {}, {
    state: scope.state ?? {},
    context: scope.context ?? {},
  }) as Json;
}

export function createDemoRunnerEffectHandlersV1(
  callbacks: DemoRunnerEffectCallbacksV1,
): EffectHandlerMap {
  return {
    async resetRunner() {
      return {
        outcome: "reset",
        ops: [
          setOp("runner.currentEntryIndex", 0),
          setOp("runner.execution", {
            resetBlueprintStateAtStartApplied: false,
            completedEntryIds: [],
            journal: [],
          }),
          setOp("runner.control.selectedJournalId", ""),
        ],
      };
    },
    async runSequenceEntry(ctx) {
      const scenario = scenarioFrom(ctx.get("runner.scenario"));
      let entryIndex = Number(ctx.get("runner.currentEntryIndex") ?? 0);
      let entry = scenario?.sequence[entryIndex];
      if (!scenario || !entry) return { outcome: "complete" };

      const execution = executionFrom(ctx.get("runner.execution"));
      if (entryIndex === 0 && scenario.resetBlueprintStateAtStart === true && !execution.resetBlueprintStateAtStartApplied) {
        await callbacks.runTransition({
          gik: "0.1",
          type: "event",
          payload: { node: "demo-host", name: "reset-state" },
        });
        execution.resetBlueprintStateAtStartApplied = true;
      }

      do {
        setJournalStatus(execution, scenario, entry, entryIndex + 1, "running");

        let observations: Record<string, Json> | undefined;
        if (entry.kind === "act") {
          await callbacks.runTransition(structuredClone(entry.event));
        } else if (entry.kind === "wait") {
          const waitExpression = entry.when;
          await callbacks.waitUntil(async (scope) => await evaluate(waitExpression, scope) === true);
        } else {
          const scope = await callbacks.getExpressionScope();
          observations = {};
          for (const [name, expression] of Object.entries(entry.select)) {
            observations[name] = await evaluate(expression, scope);
          }
        }

        execution.completedEntryIds = [...new Set([...execution.completedEntryIds, entry.id])];
        setJournalStatus(execution, scenario, entry, entryIndex + 1, "completed", observations);
        entryIndex += 1;
        entry = scenario.sequence[entryIndex];
      } while (entry && entry.kind !== "act");

      return {
        outcome: "completed",
        ops: [
          setOp("runner.currentEntryIndex", entryIndex),
          setOp("runner.execution", execution as unknown as Json),
        ],
      };
    },

    async applyNamedContext(ctx) {
      const id = String(ctx.payload.value ?? "");
      const namedContexts = ctx.get("runner.namedPresetContexts");
      const namedContext = Array.isArray(namedContexts)
        ? record(namedContexts.find((candidate) => record(candidate).id === id) ?? null)
        : record(record(namedContexts)[id]);
      const patch = record(namedContext.context);
      if (!id || Object.keys(patch).length === 0) return { outcome: "ignored" };

      const next = { ...record(ctx.get("runner.externalContext")), ...structuredClone(patch) };
      await callbacks.setExternalContext(next);
      return {
        outcome: "updated",
        ops: [
          setOp("runner.selectedContextId", id),
          setOp("runner.externalContext", next),
        ],
      };
    },

    async saveExternalContext(ctx) {
      const values = record(ctx.payload.values as Json);
      await callbacks.setExternalContext(structuredClone(values));
      return {
        outcome: "updated",
        ops: [setOp("runner.externalContext", values)],
      };
    },
  };
}