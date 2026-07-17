import type { FocusKind, FocusRef, TimelineItem } from "./control-focus";

export {
  focusRefMatches,
  resolveFocusTargets,
  selectionContainsFocus,
  selectionFromTimelineItem,
} from "./control-focus";
export type {
  ControlSelection as DemoSelection,
  FocusKind,
  FocusRef,
  FocusTarget,
  TimelineItem,
} from "./control-focus";

export interface ScenarioStep {
  id: string;
  title: string;
  kind: "dispatch" | "human-gate";
  command?: string;
  commands?: string[];
  actorRef?: FocusRef;
  waitAfterMs?: number;
  humanBoundary?: FocusRef;
  focusRefs?: FocusRef[];
}

export interface OrganismDemoContract {
  blueprintId: string;
  commands: string[];
  actors: string[];
  presentationContexts: string[];
  focusKinds: FocusKind[];
  timelineSources: TimelineItem["source"][];
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
  requiredTimelineSources?: TimelineItem["source"][];
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
    const commands = step.commands?.filter((command) => command.trim()) ?? [];
    if (step.kind === "dispatch" && !step.command?.trim() && commands.length === 0) {
      throw new Error(`Dispatched scenario step '${step.id}' requires a command or commands`);
    }
    if (step.command?.trim() && commands.length > 0) {
      throw new Error(`Dispatched scenario step '${step.id}' cannot declare both command and commands`);
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

export function scenarioStepCommands(step: ScenarioStep): string[] {
  return step.commands?.length ? step.commands.filter((command) => command.trim()) : step.command?.trim() ? [step.command] : [];
}

export function validateDemoComposition(
  entry: DemoCatalogEntry,
  scenario: ScenarioPlan,
  organism: OrganismDemoContract
): void {
  if (scenario.targetBlueprintId !== organism.blueprintId || entry.targetBlueprintId !== organism.blueprintId) {
    throw new Error(`Demo '${entry.id}' targets an incompatible organism`);
  }
  const commands = new Set(organism.commands);
  const actors = new Set(organism.actors);
  const contexts = new Set(organism.presentationContexts);
  const focusKinds = new Set(organism.focusKinds);
  const timelineSources = new Set(organism.timelineSources);
  for (const step of scenario.steps) {
    for (const command of scenarioStepCommands(step)) {
      if (!commands.has(command)) throw new Error(`Unsupported scenario command '${command}'`);
    }
    for (const actor of [step.actorRef, step.humanBoundary]) {
      if (actor && !actors.has(actor.id)) throw new Error(`Unsupported scenario actor '${actor.id}'`);
    }
    for (const focus of [step.actorRef, step.humanBoundary, ...(step.focusRefs ?? [])]) {
      if (focus && !focusKinds.has(focus.kind)) throw new Error(`Unsupported focus kind '${focus.kind}'`);
    }
  }
  if (entry.defaultContext && !contexts.has(entry.defaultContext)) {
    throw new Error(`Unsupported presentation context '${entry.defaultContext}'`);
  }
  for (const source of entry.requiredTimelineSources ?? []) {
    if (!timelineSources.has(source)) throw new Error(`Unsupported timeline source '${source}'`);
  }
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
  return next.toString();
}
