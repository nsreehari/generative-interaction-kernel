export type FocusKind = "actor" | "cell" | "token" | "entity" | "record" | "region" | "action";

export interface FocusRef {
  namespace: string;
  kind: FocusKind;
  id: string;
  relation?: "origin" | "affected" | "produced" | "consumed" | "authorized" | "observed";
}

export interface TimelineItem {
  id: string;
  source: "scenario" | "organism";
  title: string;
  summary: string;
  status: string;
  focusRefs: FocusRef[];
  scenarioStepId?: string;
  operationRecordId?: string;
  actorRef?: FocusRef;
  sequence?: number;
  timestamp?: string;
  detailFields?: Array<{ label: string; value: string }>;
  correlationId?: string;
}

export interface DemoSelection {
  source: TimelineItem["source"];
  itemId: string;
  focusRefs: FocusRef[];
}

export interface ScenarioStep {
  id: string;
  title: string;
  kind: "dispatch" | "human-gate";
  command?: string;
  actorRef?: FocusRef;
  waitAfterMs?: number;
  humanBoundary?: FocusRef;
}

export interface ScenarioPlan {
  id: string;
  targetBlueprintId: string;
  title: string;
  pace: {
    manualDurationMs: number;
    autoDurationMs: number;
    default: "manual" | "auto";
  };
  steps: ScenarioStep[];
}

export interface ScenarioBlueprintArtifact {
  gik: string;
  type: "scenario-blueprint";
  payload: ScenarioPlan;
}

export interface DemoCatalogEntry {
  id: string;
  label: string;
  scenarioBlueprintId: string;
  targetBlueprintId: string;
  bundleId: string;
  defaultContext?: string;
}

export interface DemoCatalog {
  default: string;
  entries: DemoCatalogEntry[];
}

export interface ScenarioCursor {
  stepIndex: number;
  advanceToken: number;
}

export function compileScenarioBlueprint(artifact: ScenarioBlueprintArtifact): ScenarioPlan {
  const plan = artifact.payload;
  if (!plan.id.trim()) throw new Error("Scenario Blueprint id is required");
  if (!plan.targetBlueprintId.trim()) throw new Error("Scenario target Blueprint id is required");
  if (plan.steps.length === 0) throw new Error("Scenario Blueprint must define at least one step");

  const stepIds = new Set<string>();
  for (const step of plan.steps) {
    if (!step.id.trim() || !step.title.trim()) {
      throw new Error("Scenario steps require id and title");
    }
    if (step.kind === "dispatch" && !step.command?.trim()) {
      throw new Error(`Dispatched scenario step '${step.id}' requires a command`);
    }
    if (step.kind === "human-gate" && !step.humanBoundary) {
      throw new Error(`Human-gate scenario step '${step.id}' requires a human boundary`);
    }
    if (stepIds.has(step.id)) throw new Error(`Duplicate scenario step id '${step.id}'`);
    stepIds.add(step.id);
  }

  return structuredClone(plan);
}

export function nextScenarioStep(plan: ScenarioPlan, cursor: ScenarioCursor): ScenarioStep | undefined {
  if (cursor.advanceToken <= 0) return undefined;
  return plan.steps[cursor.stepIndex];
}

export function selectionFromTimelineItem(item: TimelineItem): DemoSelection {
  return {
    source: item.source,
    itemId: item.id,
    focusRefs: [...item.focusRefs],
  };
}

export function focusRefMatches(candidate: FocusRef, target: FocusRef): boolean {
  return candidate.namespace === target.namespace
    && candidate.kind === target.kind
    && candidate.id === target.id;
}

export function selectionContainsFocus(
  selection: DemoSelection | undefined,
  targets: readonly FocusRef[]
): boolean {
  if (!selection) return false;
  return selection.focusRefs.some((candidate) =>
    targets.some((target) => focusRefMatches(candidate, target))
  );
}

export function validateDemoCatalog(
  catalog: DemoCatalog,
  scenarioPlans: ReadonlyMap<string, ScenarioPlan>
): DemoCatalog {
  if (catalog.entries.length === 0) throw new Error("Demo catalog must contain at least one entry");
  const entryIds = new Set<string>();
  for (const entry of catalog.entries) {
    if (entryIds.has(entry.id)) throw new Error(`Duplicate demo catalog entry '${entry.id}'`);
    entryIds.add(entry.id);
    const scenario = scenarioPlans.get(entry.scenarioBlueprintId);
    if (!scenario) throw new Error(`Unknown Scenario Blueprint '${entry.scenarioBlueprintId}'`);
    if (scenario.targetBlueprintId !== entry.targetBlueprintId) {
      throw new Error(
        `Demo '${entry.id}' targets '${entry.targetBlueprintId}', but scenario '${scenario.id}' targets '${scenario.targetBlueprintId}'`
      );
    }
  }
  if (!entryIds.has(catalog.default)) throw new Error(`Unknown default demo '${catalog.default}'`);
  return structuredClone(catalog);
}

export function resolveDemoEntry(catalog: DemoCatalog, requestedId?: string | null): DemoCatalogEntry {
  return catalog.entries.find((entry) => entry.id === requestedId)
    ?? catalog.entries.find((entry) => entry.id === catalog.default)
    ?? catalog.entries[0];
}

export function writeDemoNavigation(url: string, entry: DemoCatalogEntry): string {
  const next = new URL(url);
  next.searchParams.set("demo", entry.id);
  next.searchParams.set("bundle", entry.bundleId);
  if (entry.defaultContext) next.searchParams.set("context", entry.defaultContext);
  else next.searchParams.delete("context");
  next.searchParams.delete("plane");
  return next.toString();
}
