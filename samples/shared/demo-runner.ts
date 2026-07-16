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

interface RuntimeNode {
  edges?: {
    read?: Record<string, string>;
    on?: Record<string, unknown[]>;
    children?: RuntimeNode[];
  };
  [key: string]: unknown;
}

interface RuntimeDocument {
  root: RuntimeNode;
  [key: string]: unknown;
}

export interface DemoRunnerDocumentBindings {
  stateNamespace: string;
  timerCapability?: string;
  timerRegionId?: string;
}

interface BundleManifest {
  capabilities: Record<string, {
    propsSchema?: Record<string, unknown>;
    emits?: string[];
    [key: string]: unknown;
  }>;
  externals?: {
    effectHandlers?: string[];
    projectionViews?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function composeDemoRunnerManifest<T extends BundleManifest>(manifest: T): T {
  const composed = structuredClone(manifest);
  composed.capabilities["ui:timer-button"] = {
    propsSchema: { type: "object", additionalProperties: true },
    emits: ["press"],
  };
  const workspace = composed.capabilities["soc:workspace"];
  if (!workspace) throw new Error("Demo runner requires a workspace capability");
  workspace.emits = [...new Set([
    ...(workspace.emits ?? []),
    "setPace",
    "finishAct",
    "reset",
  ])];
  composed.externals ??= {};
  composed.externals.effectHandlers = [...new Set([
    ...(composed.externals.effectHandlers ?? []),
    "requestNextAct",
    "setPace",
    "finishAct",
    "resetScenario",
  ])];
  composed.externals.projectionViews = {
    ...(composed.externals.projectionViews ?? {}),
    ui: { from: "floor", use: ["timer-button"] },
  };
  return composed;
}

export function composeDemoRunnerState<T extends Record<string, unknown>>(
  organismState: T,
  scenarioPlan: ScenarioPlan,
  stateNamespace: string
): T {
  const composed = structuredClone(organismState);
  const namespaceState = composed[stateNamespace];
  if (!namespaceState || typeof namespaceState !== "object" || Array.isArray(namespaceState)) {
    throw new Error(`Demo runner state namespace '${stateNamespace}' is unavailable`);
  }
  const pace = scenarioPlan.pace.default;
  Object.assign(namespaceState, {
    act: 0,
    step: "ready",
    presenter: {
      pace,
      durationMs: pace === "auto"
        ? scenarioPlan.pace.autoDurationMs
        : scenarioPlan.pace.manualDurationMs,
      locked: false,
      advanceToken: 0,
    },
  });
  return composed;
}

export function composeDemoRunnerDocument<T extends RuntimeDocument>(
  organismDocument: T,
  _scenarioPlan: ScenarioPlan,
  bindings: DemoRunnerDocumentBindings
): T {
  const document = structuredClone(organismDocument);
  const edges = document.root.edges ??= {};
  const namespace = bindings.stateNamespace;
  edges.read = {
    ...(edges.read ?? {}),
    act: `${namespace}.act`,
    presenter: `${namespace}.presenter`,
    step: `${namespace}.step`,
  };
  edges.on = {
    ...(edges.on ?? {}),
    setPace: [{ do: "invoke", args: { tool: "setPace" } }],
    finishAct: [{ do: "invoke", args: { tool: "finishAct" } }],
    reset: [{ do: "invoke", args: { tool: "resetScenario" } }],
  };
  edges.children = [
    ...(edges.children ?? []),
    {
      capability: bindings.timerCapability ?? "ui:timer-button",
      id: bindings.timerRegionId ?? "next-act-timer-region",
      props: { label: "Next act", tone: "primary", showCountdown: true },
      edges: {
        read: {
          durationMs: `${namespace}.presenter.durationMs`,
          disabled: `${namespace}.presenter.locked`,
        },
        on: {
          press: [{ do: "invoke", args: { tool: "requestNextAct" } }],
        },
      },
    },
  ];
  return document;
}
