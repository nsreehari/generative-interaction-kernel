import React from "react";
import {
  resolveDeclarativeFormInitialValue,
  type DeclarativeFormSpec,
} from "@gik/evaluators";
import {
  materializeBlueprint,
  parseBlueprintReference,
  type BlueprintArtifact,
  type BlueprintTransitionResult,
  type ExternalContext,
  type MaterializedBlueprint,
} from "@gik/blueprint";
import type { GIKEvent, Json } from "@gik/kernel";
import { fluentComponentViews } from "@gik/components/fluent";
import {
  BundleHost,
  SharedContextStore,
  bundleFromJson,
  type BlueprintController,
  type BundleContextBindings,
  type BundleNative,
  type GenUIFileServices,
  type GenUISource,
  type OrganismBridge,
  type ProviderResolver,
  type ReactBlueprintHostRegistry,
} from "@gik/react";
import demoRunnerBundleJson from "./demoRunnerBundleV1.json" with { type: "json" };
import { createDemoRunnerEffectHandlersV1, type DemoRunnerEvent, type DemoRunnerExpressionScope } from "./demoRunnerEffectHandlersV1";
import { demoRunnerLeavesV1 } from "./demoRunnerLeavesV1";
import { GikToolingShell } from "./tooling-shell";

const EMPTY_CONTEXTS: BundleContextBindings = {};

export interface DemoRunnerDocument {
  contextFormSpec?: DeclarativeFormSpec;
  namedPresetContexts: Record<string, { label: string; context: Record<string, Json> }>;
  scenarios: Array<{
    id: string;
    shortDescription: string;
    participants: Record<string, Json>;
    sequence: Json[];
  }>;
}

export interface DemoTargetHostProps {
  blueprint: BlueprintArtifact;
  resolveLeavesProvider?: ProviderResolver;
  native?: BundleNative;
  contexts?: BundleContextBindings;
  fileServices?: GenUIFileServices;
  primaryBridge?: OrganismBridge;
  primaryInstanceId?: string | number;
  className?: string;
  style?: React.CSSProperties;
  externalContext?: ExternalContext;
  context?: Record<string, Json>;
  onTransition?: (event: GIKEvent | null, result: BlueprintTransitionResult) => void;
  blueprintRegistry?: ReactBlueprintHostRegistry;
}

export interface GikDemoBlueprintHostProps extends Omit<DemoTargetHostProps, "primaryBridge" | "onTransition"> {
  HostComponent: React.ComponentType<DemoTargetHostProps>;
  scenariosJson?: DemoRunnerDocument;
  resolveNative?: (materializedBlueprint: MaterializedBlueprint) => BundleNative;
}

interface TargetSource extends GenUISource {
  getState(): Record<string, Json>;
}

interface LedgerEntry {
  id: string;
  sequence: number;
  event: GIKEvent;
  effects: NonNullable<BlueprintTransitionResult["effects"]>;
  blueprintPatchProposals: NonNullable<BlueprintTransitionResult["blueprintPatchProposals"]>;
}

function demoEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const value = new URLSearchParams(window.location.search).get("demo");
  return value !== null && value !== "0";
}

function isTargetSource(source: GenUISource): source is TargetSource {
  return "getState" in source && typeof (source as Partial<TargetSource>).getState === "function";
}

export function GikDemoBlueprintHost({
  HostComponent,
  blueprint,
  resolveLeavesProvider,
  native,
  contexts = EMPTY_CONTEXTS,
  fileServices,
  primaryInstanceId,
  className,
  style,
  externalContext,
  context,
  scenariosJson,
  resolveNative,
  blueprintRegistry,
}: GikDemoBlueprintHostProps): React.ReactElement {
  const enabled = React.useMemo(demoEnabled, []);
  if (!enabled || !scenariosJson) {
    return <ResolvedTargetHost HostComponent={HostComponent} blueprint={blueprint} resolveLeavesProvider={resolveLeavesProvider} native={native} resolveNative={resolveNative} contexts={contexts} fileServices={fileServices} primaryInstanceId={primaryInstanceId} className={className} style={style} externalContext={externalContext} context={context} blueprintRegistry={blueprintRegistry} />;
  }

  return <ActiveDemoHost HostComponent={HostComponent} blueprint={blueprint} resolveLeavesProvider={resolveLeavesProvider} native={native} resolveNative={resolveNative} contexts={contexts} fileServices={fileServices} primaryInstanceId={primaryInstanceId} className={className} style={style} externalContext={externalContext} context={context} scenariosJson={scenariosJson} blueprintRegistry={blueprintRegistry} />;
}

function ResolvedTargetHost({
  HostComponent,
  resolveNative,
  ...props
}: GikDemoBlueprintHostProps): React.ReactElement {
  const parentInstanceId = props.primaryInstanceId === undefined
    ? props.blueprint.payload.id
    : `${props.blueprint.payload.id}:${props.primaryInstanceId}`;
  const materialized = React.useMemo(
    () => materializeBlueprint({
      blueprint: props.blueprint,
      externalContext: props.externalContext,
      resolveBlueprint: (ref, childContext) => {
        if (!props.blueprintRegistry) throw new Error(`No Blueprint host registry can resolve '${ref}'`);
        return props.blueprintRegistry.resolveArtifact(parseBlueprintReference(ref), {
          ...childContext,
          parentInstanceId,
        });
      },
    }),
    [parentInstanceId, props.blueprint, props.blueprintRegistry, props.externalContext],
  );
  const resolvedNative = React.useMemo(
    () => resolveNative?.(materialized) ?? props.native,
    [materialized, props.native, resolveNative],
  );
  return <HostComponent {...props} native={resolvedNative} />;
}

function ActiveDemoHost({
  HostComponent,
  blueprint,
  resolveLeavesProvider,
  native,
  contexts = EMPTY_CONTEXTS,
  fileServices,
  primaryInstanceId,
  className,
  style,
  externalContext,
  context,
  scenariosJson,
  resolveNative,
  blueprintRegistry,
}: GikDemoBlueprintHostProps & { scenariosJson: DemoRunnerDocument }): React.ReactElement {
  const contextFormSpec = scenariosJson.contextFormSpec ?? blueprint.payload.contextFormSpec;
  const [externalContextState, setExternalContextState] = React.useState<ExternalContext>(
    () => resolveDeclarativeFormInitialValue(contextFormSpec, externalContext),
  );
  const [targetEpoch, setTargetEpoch] = React.useState(0);
  const targetRef = React.useRef<TargetSource | null>(null);
  const targetConnectionWaitersRef = React.useRef<Array<() => void>>([]);
  const ledgerSequenceRef = React.useRef(0);
  const materializedBlueprint = React.useMemo(
    () => materializeBlueprint({
      blueprint,
      externalContext: externalContextState,
      resolveBlueprint: (ref, childContext) => {
        if (!blueprintRegistry) throw new Error(`No Blueprint host registry can resolve '${ref}'`);
        return blueprintRegistry.resolveArtifact(parseBlueprintReference(ref), {
          ...childContext,
          parentInstanceId: `${blueprint.payload.id}:${primaryInstanceId ?? "demo"}:${targetEpoch}`,
        });
      },
    }),
    [blueprint, blueprintRegistry, externalContextState, primaryInstanceId, targetEpoch],
  );
  const resolvedNative = React.useMemo(
    () => resolveNative?.(materializedBlueprint) ?? native,
    [materializedBlueprint, native, resolveNative],
  );
  const ledgerStore = React.useMemo(() => {
    const store = SharedContextStore.create(["demoLedger"]);
    store.apply([{ op: "set", path: "demoLedger.entries", value: [] }]);
    return store;
  }, []);
  const targetStore = React.useMemo(() => SharedContextStore.create(["demoTarget"]), []);
  React.useEffect(() => {
    targetStore.apply([{ op: "set", path: "demoTarget.materializedBlueprint", value: structuredClone(materializedBlueprint) as unknown as Json }]);
  }, [materializedBlueprint, targetStore]);

  const appendLedger = React.useCallback((event: GIKEvent, result: BlueprintTransitionResult) => {
    const entries = ledgerStore.get("demoLedger.entries");
    const current = Array.isArray(entries) ? entries : [];
    const sequence = ++ledgerSequenceRef.current;
    const entry: LedgerEntry = {
      id: `transition-${sequence}`,
      sequence,
      event: structuredClone(event),
      effects: structuredClone(result.effects ?? []),
      blueprintPatchProposals: structuredClone(result.blueprintPatchProposals ?? result.blueprintPatches ?? []),
    };
    ledgerStore.apply([{ op: "set", path: "demoLedger.entries", value: [...current, entry] as unknown as Json }]);
  }, [ledgerStore]);

  const onTransition = React.useCallback((event: GIKEvent | null, result: BlueprintTransitionResult) => {
    if (event) appendLedger(event, result);
  }, [appendLedger]);

  const primaryBridge = React.useMemo<OrganismBridge>(() => ({
    connect(source) {
      if (!isTargetSource(source)) throw new Error("GikDemoBlueprintHost requires a BlueprintController source");
      targetRef.current = source;
      for (const resolve of targetConnectionWaitersRef.current.splice(0)) resolve();
      return () => {
        if (targetRef.current === source) targetRef.current = null;
      };
    },
  }), []);

  const getExpressionScope = React.useCallback((): DemoRunnerExpressionScope => ({
    state: targetRef.current?.getState() ?? {},
    context: structuredClone(externalContextState) as Json,
  }), [externalContextState]);

  const waitUntil = React.useCallback(async (
    predicate: (scope: DemoRunnerExpressionScope) => boolean | Promise<boolean>,
    signal?: AbortSignal,
  ): Promise<DemoRunnerExpressionScope> => {
    const source = targetRef.current;
    if (!source) throw new Error("Target Blueprint is not connected");
    const current = getExpressionScope();
    if (await predicate(current)) return current;
    return await new Promise<DemoRunnerExpressionScope>((resolve, reject) => {
      let evaluating = false;
      const abort = () => {
        unsubscribe();
        reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Runner wait cancelled", "AbortError"));
      };
      const unsubscribe = source.subscribe(() => {
        if (evaluating) return;
        evaluating = true;
        const scope = getExpressionScope();
        void Promise.resolve(predicate(scope)).then((satisfied) => {
          evaluating = false;
          if (!satisfied) return;
          unsubscribe();
          signal?.removeEventListener("abort", abort);
          resolve(scope);
        }, (error: unknown) => {
          unsubscribe();
          signal?.removeEventListener("abort", abort);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
  }, [getExpressionScope]);

  const runTransition = React.useCallback(async (message: DemoRunnerEvent) => {
    const event = message.payload;
    if (event.node === "demo-host" && event.name === "reset-state") {
      appendLedger(event, { state: {} });
      targetRef.current = null;
      const connected = new Promise<void>((resolve) => targetConnectionWaitersRef.current.push(resolve));
      setTargetEpoch((value) => value + 1);
      await connected;
      return;
    }
    const source = targetRef.current;
    if (!source) throw new Error("Target Blueprint is not connected");
    await source.emit(event.node, event.name, event.payload);
  }, [appendLedger]);

  const setExternalContext = React.useCallback((values: Record<string, Json>) => {
    setExternalContextState(structuredClone(values));
    setTargetEpoch((value) => value + 1);
  }, []);

  const toolingBundle = React.useMemo(() => {
    const json = structuredClone(demoRunnerBundleJson);
    const firstScenario = scenariosJson.scenarios[0] ?? null;
    json.state.runner.scenarios = structuredClone(scenariosJson.scenarios) as never;
    json.state.runner.selectedScenarioId = firstScenario?.id ?? "";
    json.state.runner.scenario = structuredClone(firstScenario) as never;
    json.state.runner.namedPresetContexts = Object.entries(scenariosJson.namedPresetContexts).map(([id, preset]) => ({
      id,
      ...structuredClone(preset),
    })) as never;
    json.state.runner.contextFormSpec = structuredClone(contextFormSpec ?? null) as never;
    json.state.runner.externalContext = structuredClone(externalContextState) as never;
    return bundleFromJson(json, {
      effectHandlers: createDemoRunnerEffectHandlersV1({ runTransition, getExpressionScope, waitUntil, setExternalContext }),
      projectionViews: { ...demoRunnerLeavesV1, ...fluentComponentViews },
    });
  }, []); // The runner owns its live state after its initial seed.

  const mergedContexts = React.useMemo(() => ({ ...contexts, demoLedger: ledgerStore, demoTarget: targetStore }), [contexts, ledgerStore, targetStore]);
  const resolvedPrimaryInstanceId = `${primaryInstanceId ?? "demo"}:${targetEpoch}`;

  return (
    <GikToolingShell runnerVisible inspectorVisible>
      <HostComponent key={resolvedPrimaryInstanceId} blueprint={blueprint} resolveLeavesProvider={resolveLeavesProvider} native={resolvedNative} contexts={mergedContexts} fileServices={fileServices} primaryBridge={primaryBridge} primaryInstanceId={resolvedPrimaryInstanceId} className={className} style={style} externalContext={externalContextState} context={context} onTransition={onTransition} blueprintRegistry={blueprintRegistry} />
      <BundleHost bundle={toolingBundle} resolveProvider={resolveLeavesProvider} contexts={mergedContexts} fileServices={fileServices} />
    </GikToolingShell>
  );
}