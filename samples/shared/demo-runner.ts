import type { FocusKind, FocusRef, TimelineItem } from "./control-focus";
import type { DocNode, ProjectedProgramDefinition, Json, ProjectedVocabularyManifest } from "@gik/kernel";

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
  payload?: Record<string, import("@gik/kernel").Json>;
  actorRef?: FocusRef;
  waitAfterMs?: number;
  humanBoundary?: FocusRef;
  focusRefs?: FocusRef[];
}

export interface OrganismDemoContract {
  blueprintId: string;
  commands: string[];
  humanGates: string[];
  actors: string[];
  presentationPresets: PresentationPreset[];
  focusKinds: FocusKind[];
  timelineSources: TimelineItem["source"][];
}

export interface PresentationPreset {
  id: string;
  label?: string;
  audience?: string;
  focus?: string;
  context: Record<string, Json>;
}

export interface ScenarioPlan {
  id: string;
  targetBlueprintId: string;
  title: string;
  applicableContexts: string[];
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
  defaultContext?: string;
  requiredTimelineSources?: TimelineItem["source"][];
}

export interface DemoCatalog {
  default: string;
  targets: Record<string, DemoTargetCatalogEntry>;
  entries: DemoCatalogEntry[];
}

export interface DemoTargetCatalogEntry {
  commands: Array<{ command: string; nodeId: string; event: string }>;
  humanGates: string[];
  observableOutcomes: string[];
  actors: string[];
  presentationPresets: PresentationPreset[];
  focusKinds: FocusKind[];
  timelineSources: TimelineItem["source"][];
}

export interface ScenarioCursor {
  stepIndex: number;
  advanceToken: number;
}

export function compileScenarioBlueprint(artifact: ScenarioBlueprintArtifact): ScenarioPlan {
  const plan = artifact.payload;
  if (!plan.id.trim()) throw new Error("Scenario Blueprint id is required");
  if (!plan.targetBlueprintId.trim()) throw new Error("Scenario target Blueprint id is required");
  if (!Array.isArray(plan.applicableContexts) || plan.applicableContexts.length === 0) {
    throw new Error("Scenario Blueprint must define at least one applicable context");
  }
  if (plan.applicableContexts.some((contextId) => typeof contextId !== "string" || !contextId.trim())) {
    throw new Error("Scenario Blueprint applicable contexts must be non-empty strings");
  }
  if (new Set(plan.applicableContexts).size !== plan.applicableContexts.length) {
    throw new Error("Scenario Blueprint applicable contexts must be unique");
  }
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
    if (step.kind === "human-gate") {
      if (!step.humanBoundary) {
        throw new Error(`Human-gate scenario step '${step.id}' requires a human boundary`);
      }
      if (!step.command?.trim() || commands.length > 0) {
        throw new Error(`Human-gate scenario step '${step.id}' requires exactly one command`);
      }
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
  const humanGates = new Set(organism.humanGates);
  const actors = new Set(organism.actors);
  const contexts = new Set(organism.presentationPresets.map((preset) => preset.id));
  const focusKinds = new Set(organism.focusKinds);
  const timelineSources = new Set(organism.timelineSources);
  for (const step of scenario.steps) {
    for (const command of scenarioStepCommands(step)) {
      if (!commands.has(command)) throw new Error(`Unsupported scenario command '${command}'`);
      if (step.kind === "human-gate" && !humanGates.has(command)) {
        throw new Error(`Scenario command '${command}' is not a human gate`);
      }
      if (step.kind === "dispatch" && humanGates.has(command)) {
        throw new Error(`Human-gated command '${command}' cannot be dispatched automatically`);
      }
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
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("Demo catalog must be an object");
  }
  if (!catalog.targets || typeof catalog.targets !== "object" || Array.isArray(catalog.targets)) {
    throw new Error("Demo catalog targets must be an object");
  }
  for (const [targetId, target] of Object.entries(catalog.targets)) validateDemoTarget(targetId, target);
  if (!Array.isArray(catalog.entries)) throw new Error("Demo catalog entries must be an array");
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
    if (!catalog.targets[entry.targetBlueprintId]) {
      throw new Error(`Demo '${entry.id}' references unknown target '${entry.targetBlueprintId}'`);
    }
  }
  if (!entryIds.has(catalog.default)) throw new Error(`Unknown default demo '${catalog.default}'`);
  return structuredClone(catalog);
}

function validateDemoTarget(targetId: string, target: DemoTargetCatalogEntry): void {
  if (!targetId.trim()) throw new Error("Demo target id is required");
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new Error(`Demo target '${targetId}' must be an object`);
  }
  const arrays: Array<[keyof DemoTargetCatalogEntry, unknown]> = [
    ["commands", target.commands],
    ["humanGates", target.humanGates],
    ["observableOutcomes", target.observableOutcomes],
    ["actors", target.actors],
    ["focusKinds", target.focusKinds],
    ["timelineSources", target.timelineSources],
  ];
  for (const [field, value] of arrays) {
    if (!Array.isArray(value)) throw new Error(`Demo target '${targetId}' requires '${field}'`);
  }
  if (target.commands.length === 0) throw new Error(`Demo target '${targetId}' requires at least one command`);
  const commandNames = new Set<string>();
  for (const descriptor of target.commands) {
    if (!descriptor || typeof descriptor !== "object"
      || !descriptor.command?.trim() || !descriptor.nodeId?.trim() || !descriptor.event?.trim()) {
      throw new Error(`Demo target '${targetId}' has an invalid command descriptor`);
    }
    if (commandNames.has(descriptor.command)) {
      throw new Error(`Demo target '${targetId}' has duplicate command '${descriptor.command}'`);
    }
    commandNames.add(descriptor.command);
  }
  const validateStrings = (field: string, values: unknown[]) => {
    if (values.some((value) => typeof value !== "string" || !value.trim())) {
      throw new Error(`Demo target '${targetId}' has an invalid '${field}' entry`);
    }
    if (new Set(values).size !== values.length) {
      throw new Error(`Demo target '${targetId}' has duplicate '${field}' entries`);
    }
  };
  validateStrings("humanGates", target.humanGates);
  validateStrings("observableOutcomes", target.observableOutcomes);
  validateStrings("actors", target.actors);
  validateStrings("focusKinds", target.focusKinds);
  validateStrings("timelineSources", target.timelineSources);
  if (!Array.isArray(target.presentationPresets) || target.presentationPresets.length === 0) {
    throw new Error(`Demo target '${targetId}' requires 'presentationPresets'`);
  }
  const presetIds = new Set<string>();
  for (const preset of target.presentationPresets) {
    if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
      throw new Error(`Demo target '${targetId}' has an invalid 'presentationPresets' entry`);
    }
    if (typeof preset.id !== "string" || !preset.id.trim()) {
      throw new Error(`Demo target '${targetId}' has an invalid presentation preset id`);
    }
    if (presetIds.has(preset.id)) {
      throw new Error(`Demo target '${targetId}' has duplicate presentation preset '${preset.id}'`);
    }
    if (!preset.context || typeof preset.context !== "object" || Array.isArray(preset.context)) {
      throw new Error(`Demo target '${targetId}' preset '${preset.id}' requires an object context`);
    }
    presetIds.add(preset.id);
  }
  for (const gate of target.humanGates) {
    if (!commandNames.has(gate)) {
      throw new Error(`Demo target '${targetId}' human gate '${gate}' has no command descriptor`);
    }
  }
}

export function validateDemoTargetBundleContract(
  targetId: string,
  target: DemoTargetCatalogEntry,
  _manifest: ProjectedVocabularyManifest,
  document: ProjectedProgramDefinition
): void {
  const nodes = new Map<string, DocNode>();
  const visit = (node: DocNode) => {
    nodes.set(node.id, node);
    for (const child of node.edges?.children ?? []) visit(child);
  };
  visit(document.root);

  for (const descriptor of target.commands) {
    const node = nodes.get(descriptor.nodeId);
    if (!node) {
      throw new Error(`Demo target '${targetId}' command '${descriptor.command}' references unknown node '${descriptor.nodeId}'`);
    }
    if (!node.edges?.on?.[descriptor.event]) {
      throw new Error(`Demo target '${targetId}' command '${descriptor.command}' references unknown event '${descriptor.event}' on node '${descriptor.nodeId}'`);
    }
  }
}

export function resolveDemoEntry(
  catalog: DemoCatalog,
  requestedId?: string | null,
  targetBlueprintId?: string | null
): DemoCatalogEntry {
  const entries = targetBlueprintId
    ? catalog.entries.filter((entry) => entry.targetBlueprintId === targetBlueprintId)
    : catalog.entries;
  if (entries.length === 0) {
    throw new Error(`No demos are registered for Blueprint '${targetBlueprintId}'`);
  }
  const exact = entries.find((entry) => entry.id === requestedId);
  if (exact) return exact;
  if (requestedId && /^\d+$/.test(requestedId)) {
    const indexed = entries[Number(requestedId)];
    if (indexed) return indexed;
  }
  return targetBlueprintId
    ? entries[0]
    : entries.find((entry) => entry.id === catalog.default) ?? entries[0];
}

export function writeDemoNavigation(url: string, entry: DemoCatalogEntry): string {
  const next = new URL(url);
  next.searchParams.set("demo", entry.id);
  return next.toString();
}
