import React from "react";
import { openBlueprint } from "@gik/controlface/blueprint";
import { unwrap, type Json, type Reaction } from "@gik/kernel";
import {
  SharedContextStore,
  type BundleContextBindings,
  type BundleNative,
  type CompositionOrganism,
  type GenUIFileServices,
  type OrganismBridge,
  type ProviderResolver,
} from "@gik/react";
import type { BlueprintArtifact } from "@gik/blueprint";
import { createDemoRunnerBundle, createGikControlHarnessBundle } from "./internal-bundles";
import { dispatchDemoControlRequest, withDemoHumanGate } from "./internal-demo-control-bridge";
import type { ControlReceipt, ControlRequest } from "./control-runtime";
import { resolvePresentationContext } from "./presentation";
import {
  GIK_DEMO_APPLY_STATE_COMMAND,
  GIK_DEMO_RESET_STATE_COMMAND,
  isBuiltInDemoCommand,
  type DemoCatalog,
  type DemoCatalogEntry,
  type DemoScenariosJson,
  type OrganismDemoContract,
  type ScenarioPlan,
  loadDemoScenarios,
} from "./demo-runner";
import type { OrganismControlContract } from "./control-runtime";

const EMPTY_COMPANIONS: CompositionOrganism[] = [];
const EMPTY_CONTEXTS: BundleContextBindings = {};

const compositionStyle: React.CSSProperties = {
  height: "100vh",
  display: "grid",
  gridTemplateRows: "minmax(0, 1fr) auto",
  overflow: "hidden",
};

export interface DemoComposition {
  entry: DemoCatalogEntry;
  scenarioPlan: ScenarioPlan;
  demoContract: OrganismDemoContract;
  controlContract: OrganismControlContract;
}

function readDemoQuery(): {
  demoEnabled: boolean;
  presentationContext: string | null;
} {
  if (typeof window === "undefined") {
    return { demoEnabled: false, presentationContext: null };
  }
  const params = new URLSearchParams(window.location.search);
  const demoValue = params.get("demo");
  return {
    demoEnabled: demoValue !== null && demoValue !== "0",
    presentationContext: params.get("presentation") ?? params.get("presentationContext"),
  };
}

type JsonRecord = Record<string, Json>;

function isJsonRecord(value: Json | undefined): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJsonRecord(value: JsonRecord | undefined): JsonRecord {
  return value ? structuredClone(value) : {};
}

function applyPath(target: JsonRecord, path: string, value: Json): void {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return;
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const existing = cursor[part];
    if (!isJsonRecord(existing)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as JsonRecord;
  }
  cursor[parts[parts.length - 1]] = structuredClone(value);
}

function applyBuiltInStatePayload(seed: JsonRecord, payload: Record<string, Json> | undefined): JsonRecord {
  const next = cloneJsonRecord(seed);
  const ops = Array.isArray(payload?.ops) ? payload.ops : [];
  for (const op of ops) {
    if (!op || typeof op !== "object" || Array.isArray(op)) continue;
    const path = typeof op.path === "string" ? op.path : "";
    if (!path) continue;
    applyPath(next, path, (op as Record<string, Json>).value);
  }
  return next;
}

function mergeDemoContext(baseContext: Record<string, Json> | undefined, demoSeed: JsonRecord | null): Record<string, Json> | undefined {
  if (!demoSeed || Object.keys(demoSeed).length === 0) return baseContext;
  const next = baseContext ? structuredClone(baseContext) : {};
  const mergedSeed = isJsonRecord(next.initialSeed)
    ? applyBuiltInStatePayload(next.initialSeed as JsonRecord, { ops: Object.entries(demoSeed).map(([path, value]) => ({ path, value })) as unknown as Json[] } as unknown as Record<string, Json>)
    : cloneJsonRecord(demoSeed);
  next.initialSeed = mergedSeed;
  return next;
}

// Deep-merges a presentation preset's context bag into the live shared stores.
// The bag is a state fragment keyed by namespace (e.g. `{ soc: { presentation: … } }`);
// only namespaces that have a matching live store are applied, and only scalar/array
// leaves are set so sibling keys (e.g. `soc.presentation.contexts`) are preserved.
function applyPresentationFragment(
  stores: Record<string, SharedContextStore>,
  fragment: Record<string, Json> | undefined,
): void {
  if (!fragment) return;
  for (const [namespace, subtree] of Object.entries(fragment)) {
    const store = stores[namespace];
    if (!store || !isJsonRecord(subtree)) continue;
    const ops: { op: "set"; path: string; value: Json }[] = [];
    const walk = (path: string, node: Json): void => {
      if (isJsonRecord(node)) {
        for (const [key, value] of Object.entries(node)) walk(`${path}.${key}`, value);
      } else {
        ops.push({ op: "set", path, value: node });
      }
    };
    walk(namespace, subtree);
    if (ops.length > 0) store.apply(ops);
  }
}

function replayScenarioSeed(
  baseInitialSeed: JsonRecord | null,
  scenarioPlan: ScenarioPlan,
  startIndex: number,
): JsonRecord | null {
  let seed = baseInitialSeed;
  for (const step of scenarioPlan.steps.slice(0, startIndex)) {
    const command = step.command ?? step.commands?.[0];
    if (command === GIK_DEMO_RESET_STATE_COMMAND) {
      seed = baseInitialSeed;
      continue;
    }
    if (command === GIK_DEMO_APPLY_STATE_COMMAND) {
      seed = applyBuiltInStatePayload(seed ?? {}, step.payload);
    }
  }
  return seed;
}

export interface DemoTargetHostProps {
  blueprint: BlueprintArtifact;
  resolveLeavesProvider?: ProviderResolver;
  native?: BundleNative;
  companions?: CompositionOrganism[];
  contexts?: BundleContextBindings;
  fileServices?: GenUIFileServices;
  primaryBridge?: OrganismBridge;
  primaryInstanceKey?: string | number;
  className?: string;
  style?: React.CSSProperties;
  context?: Record<string, Json>;
}

export interface GikDemoBlueprintHostProps extends Omit<DemoTargetHostProps, "primaryBridge"> {
  HostComponent: React.ComponentType<DemoTargetHostProps>;
  scenariosJson?: DemoScenariosJson;
  blueprintState?: Record<string, unknown>;
  showControlHarness?: boolean;
  presentationContext?: string | null;
  onPresentationPresetChange?: (presetId: string) => void;
}

interface ActiveDemoHostProps extends GikDemoBlueprintHostProps {
  loadedScenarios: ReturnType<typeof loadDemoScenarios>;
  queryPresentationContext: string | null;
}

export function GikDemoBlueprintHost({
  HostComponent,
  blueprint,
  native,
  companions = EMPTY_COMPANIONS,
  contexts = EMPTY_CONTEXTS,
  fileServices,
  className,
  style,
  context,
  primaryInstanceKey,
  resolveLeavesProvider,
  scenariosJson,
  blueprintState,
  showControlHarness = false,
  presentationContext,
  onPresentationPresetChange,
}: GikDemoBlueprintHostProps): React.ReactElement {
  const blueprintId = blueprint.payload.id;
  const query = React.useMemo(readDemoQuery, []);
  const loadedScenarios = React.useMemo(
    () => scenariosJson ? loadDemoScenarios(scenariosJson) : null,
    [scenariosJson],
  );
  const hasCompatibleDemo = loadedScenarios?.catalog.entries.some((entry) => entry.targetBlueprintId === blueprintId) ?? false;

  if (!query.demoEnabled || !loadedScenarios || !hasCompatibleDemo) {
    return (
      <HostComponent
        blueprint={blueprint}
        resolveLeavesProvider={resolveLeavesProvider}
        native={native}
        companions={companions}
        contexts={contexts}
        fileServices={fileServices}
        primaryInstanceKey={primaryInstanceKey}
        className={className}
        style={style}
        context={context}
      />
    );
  }

  return (
    <ActiveDemoHost
      HostComponent={HostComponent}
      blueprint={blueprint}
      native={native}
      companions={companions}
      contexts={contexts}
      fileServices={fileServices}
      className={className}
      style={style}
      context={context}
      resolveLeavesProvider={resolveLeavesProvider}
      scenariosJson={scenariosJson}
      blueprintState={blueprintState}
      showControlHarness={showControlHarness}
      presentationContext={presentationContext}
      onPresentationPresetChange={onPresentationPresetChange}
      loadedScenarios={loadedScenarios}
      queryPresentationContext={query.presentationContext}
    />
  );
}

function ActiveDemoHost({
  HostComponent,
  blueprint,
  native,
  companions = EMPTY_COMPANIONS,
  contexts = EMPTY_CONTEXTS,
  fileServices,
  primaryInstanceKey,
  className,
  style,
  context,
  resolveLeavesProvider,
  blueprintState,
  showControlHarness = false,
  presentationContext,
  onPresentationPresetChange,
  loadedScenarios,
  queryPresentationContext,
}: ActiveDemoHostProps): React.ReactElement {
  const blueprintId = blueprint.payload.id;
  const compatibleEntries = React.useMemo(
    () => loadedScenarios.catalog.entries.filter((entry) => entry.targetBlueprintId === blueprintId),
    [blueprintId, loadedScenarios.catalog.entries],
  );
  const [selectedDemoId, setSelectedDemoId] = React.useState(() => compatibleEntries[0].id);
  const resolvedDemo = React.useMemo(
    () => loadedScenarios.resolveComposition(selectedDemoId, blueprintId),
    [blueprintId, loadedScenarios, selectedDemoId],
  );
  const resolvedCatalog = loadedScenarios.catalog;

  const requestedPresentationContext = presentationContext ?? queryPresentationContext;
  const [resetEpoch, setResetEpoch] = React.useState(0);
  const resolvedPrimaryInstanceKey = `${primaryInstanceKey ?? "demo"}:${selectedDemoId}:${resetEpoch}`;
  const baseInitialSeed = React.useMemo(
    () => (context && isJsonRecord(context.initialSeed) ? cloneJsonRecord(context.initialSeed as JsonRecord) : null),
    [context],
  );
  const scenarioIndex = 0;
  const initialDemoSeed = React.useMemo(
    () => replayScenarioSeed(baseInitialSeed, resolvedDemo.scenarioPlan, scenarioIndex),
    [baseInitialSeed, resolvedDemo.scenarioPlan, scenarioIndex],
  );
  const [demoSeed, setDemoSeed] = React.useState<JsonRecord | null>(initialDemoSeed);
  React.useEffect(() => {
    setDemoSeed(initialDemoSeed);
  }, [initialDemoSeed]);
  const harnessBundle = React.useMemo(
    () => createGikControlHarnessBundle(),
    [],
  );
  const harnessControlState = harnessBundle?.state?.control;
  const presentationPresets = React.useMemo(() => {
    const availablePresets = resolvedDemo.demoContract.presentationPresets
      ?? resolvedCatalog.targets[resolvedDemo.entry.targetBlueprintId]?.presentationPresets
      ?? [];
    const applicableContexts = new Set(resolvedDemo.scenarioPlan.applicableContexts);
    return availablePresets.filter((preset) => applicableContexts.has(preset.id));
  }, [resolvedCatalog.targets, resolvedDemo]);
  const runnerBundle = React.useMemo(
    () => createDemoRunnerBundle({
      runner: {
        plan: resolvedDemo.scenarioPlan,
        catalog: compatibleEntries,
        entry: resolvedDemo.entry,
        selectedDemoId,
        presentationPresets,
      },
    }, setSelectedDemoId),
    [compatibleEntries, presentationPresets, resolvedDemo, selectedDemoId],
  );
  const resolvedPresentationContext = resolvePresentationContext(
    requestedPresentationContext,
    presentationPresets,
    resolvedDemo.entry.defaultContext,
  );

  const demoContexts = React.useMemo<Record<string, SharedContextStore>>(() => {
    const next: Record<string, SharedContextStore> = {};
    const inspection = blueprintState?.inspection && typeof blueprintState.inspection === "object" && !Array.isArray(blueprintState.inspection)
      ? structuredClone(blueprintState.inspection) as Record<string, unknown>
      : { participants: [] };
    if (!("presentation" in inspection) && presentationPresets.length > 0) {
      inspection.presentation = {
        selectedContext: resolvedPresentationContext?.id ?? "",
        contexts: presentationPresets.map((preset) => ({
          id: preset.id,
          label: preset.label ?? preset.id,
          ...(preset.audience ? { audience: preset.audience } : {}),
          ...(preset.focus ? { focus: preset.focus } : {}),
          context: preset.context,
        })),
      } as unknown as Json;
    }
    const control = SharedContextStore.create(["control"]);
    const controlSeed = {
      ...(harnessControlState && typeof harnessControlState === "object" && !Array.isArray(harnessControlState)
        ? structuredClone(harnessControlState)
        : {}),
      request: null,
      receipt: null,
      commands: {},
      presentationContext: resolvedPresentationContext?.context ?? null,
      presentationPresetId: resolvedPresentationContext?.id ?? null,
      agentModeRequest: null,
      authorizationRequest: null,
      inspection,
    } as unknown as Json;
    if (controlSeed && typeof controlSeed === "object" && !Array.isArray(controlSeed)) {
      const controlRecord = controlSeed as Record<string, Json>;
      const ui = isJsonRecord(controlRecord.ui) ? cloneJsonRecord(controlRecord.ui) : {};
      ui.gikVisible = showControlHarness;
      controlRecord.ui = ui;
    }
    control.apply([{ op: "set", path: "control", value: controlSeed }]);
    next.control = control;

    const scenarioPlan = resolvedDemo.scenarioPlan;
    const pace = scenarioPlan.pace.default;
    const demoContext = SharedContextStore.create(["demo"]);
    demoContext.apply([{ op: "set", path: "demo", value: {
      enabled: true,
      act: scenarioIndex,
      presenter: {
        pace,
        durationMs: pace === "auto" ? scenarioPlan.pace.autoDurationMs : scenarioPlan.pace.manualDurationMs,
        locked: scenarioIndex >= scenarioPlan.steps.length,
        advanceToken: 0,
      },
      request: null,
      timeline: [],
      selection: null,
    } }]);
    next.demo = demoContext;

    if (blueprintState?.soc !== undefined) {
      const soc = SharedContextStore.create(["soc"]);
      soc.apply([{ op: "set", path: "soc", value: structuredClone(blueprintState.soc) as Json }]);
      next.soc = soc;
    }
    return next;
  }, [blueprintState, harnessControlState, presentationPresets, resolvedDemo, resolvedPresentationContext, scenarioIndex, showControlHarness]);

  const mergedContexts = React.useMemo(
    () => ({ ...contexts, ...demoContexts }),
    [contexts, demoContexts],
  );
  const resolvedContext = React.useMemo(
    () => mergeDemoContext(context, demoSeed),
    [context, demoSeed],
  );

  const targetHandlesControl = React.useMemo(() => {
    const runtime = openBlueprint(blueprint);
    return unwrap(runtime.program).root.edges?.react?.some(
      (reaction: Reaction) => typeof reaction.when === "string" && reaction.when.startsWith("control.commands."),
    ) ?? false;
  }, [blueprint]);

  const controlStore = demoContexts.control;

  const primaryBridge = React.useMemo<OrganismBridge>(() => ({
    wrapSource: (controller) => controlStore ? withDemoHumanGate(controller, controlStore, resolvedDemo.controlContract) : controller,
    connect: (controller) => {
      if (!controlStore) return;
      const processed = new Set<string>();
      const dispatch = () => {
        const request = controlStore.get("control.request") as unknown as ControlRequest | null;
        if (!request || request.command === "$human-gate") return;
        const key = `${request.id}:${request.commandIndex ?? 0}:${request.command}`;
        if (processed.has(key)) return;
        processed.add(key);
        if (isBuiltInDemoCommand(request.command)) {
          if (request.command === GIK_DEMO_RESET_STATE_COMMAND) {
            setDemoSeed(baseInitialSeed);
          } else if (request.command === GIK_DEMO_APPLY_STATE_COMMAND) {
            setDemoSeed((current) => applyBuiltInStatePayload(current ?? baseInitialSeed ?? {}, request.payload));
          }
          setResetEpoch((value) => value + 1);
          const receipt: ControlReceipt = {
            requestId: request.id,
            token: request.token,
            command: request.command,
            status: "completed",
            outcome: request.command === GIK_DEMO_RESET_STATE_COMMAND ? "reset-state" : "applied-state",
          };
          controlStore.apply([
            { op: "set", path: "control.receipt", value: receipt as unknown as Json },
            { op: "set", path: "control.request", value: null },
          ]);
          return;
        }
        if (targetHandlesControl) return;
        void dispatchDemoControlRequest(controller, controlStore, resolvedDemo.controlContract, request);
      };
      const unsubscribe = controlStore.subscribe(dispatch);
      dispatch();
      return unsubscribe;
    },
  }), [baseInitialSeed, controlStore, resolvedDemo.controlContract, targetHandlesControl]);

  React.useEffect(() => {
    if (!controlStore) return;
    if (resolvedPresentationContext && controlStore.get("control.presentationPresetId") !== resolvedPresentationContext.id) {
      controlStore.apply([
        { op: "set", path: "control.presentationPresetId", value: resolvedPresentationContext.id },
        { op: "set", path: "control.presentationContext", value: resolvedPresentationContext.context as unknown as Json },
      ]);
    }
    let appliedPresetId: string | null = null;
    const notify = () => {
      const selected = controlStore.get("control.presentationPresetId");
      if (typeof selected !== "string" || !selected) return;
      if (selected !== appliedPresetId) {
        appliedPresetId = selected;
        const preset = presentationPresets.find((entry) => entry.id === selected);
        if (preset) applyPresentationFragment(demoContexts, preset.context as Record<string, Json>);
        onPresentationPresetChange?.(selected);
      }
    };
    const unsubscribe = controlStore.subscribe(notify);
    notify();
    return unsubscribe;
  }, [controlStore, demoContexts, onPresentationPresetChange, presentationPresets, resolvedPresentationContext]);

  const packageCompanions = React.useMemo<CompositionOrganism[]>(() => {
    const list = [...companions];
    list.push({ id: "gik-control-harness", bundle: harnessBundle });
    list.push({ id: `demo-runner:${selectedDemoId}`, bundle: runnerBundle });
    return list;
  }, [companions, harnessBundle, runnerBundle, selectedDemoId]);

  return (
    <HostComponent
      blueprint={blueprint}
      resolveLeavesProvider={resolveLeavesProvider}
      native={native}
      companions={packageCompanions}
      contexts={mergedContexts}
      fileServices={fileServices}
      primaryBridge={primaryBridge}
      primaryInstanceKey={resolvedPrimaryInstanceKey}
      className={className}
      style={style ? { ...compositionStyle, ...style } : compositionStyle}
      context={resolvedContext}
    />
  );
}
