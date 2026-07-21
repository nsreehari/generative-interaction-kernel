import React from "react";
import { ControlFace } from "@gik/controlface";
import { unwrap, type Json, type Reaction } from "@gik/kernel";
import { SharedContextStore, type BundleNative, type CompositionOrganism, type OrganismBridge } from "@gik/react";
import type { LayerRecipe, ProfileArtifact, ProfileArtifactBundle } from "@gik/profile";
import { BlueprintHost } from "./BlueprintHost";
import { createDemoRunnerBundle, createGikControlHarnessBundle } from "./internal-bundles";
import { dispatchDemoControlRequest, withDemoHumanGate } from "./internal-demo-control-bridge";
import type { ControlRequest } from "./control-runtime";
import { resolvePresentationContext } from "./presentation";
import type { DemoCatalog, DemoCatalogEntry, OrganismDemoContract, ScenarioPlan } from "./demo-runner";
import type { OrganismControlContract } from "./control-runtime";

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

export interface GikDemoBlueprintHostProps {
  blueprint: ProfileArtifact | ProfileArtifactBundle<LayerRecipe>;
  native?: BundleNative;
  demo: DemoComposition;
  catalog: DemoCatalog;
  blueprintState?: Record<string, unknown>;
  companions?: CompositionOrganism[];
  showControlHarness?: boolean;
  presentationContext?: string | null;
  className?: string;
  onPresentationPresetChange?: (presetId: string) => void;
}

export function GikDemoBlueprintHost({
  blueprint,
  native,
  demo,
  catalog,
  blueprintState,
  companions = [],
  showControlHarness = false,
  presentationContext,
  className,
  onPresentationPresetChange,
}: GikDemoBlueprintHostProps): React.ReactElement {
  const harnessBundle = React.useMemo(
    () => (showControlHarness ? createGikControlHarnessBundle() : null),
    [showControlHarness],
  );
  const harnessControlState = harnessBundle?.state?.control;
  const runnerBundle = React.useMemo(
    () => createDemoRunnerBundle({
      runner: {
        plan: demo.scenarioPlan,
        catalog: catalog.entries,
        entry: demo.entry,
        presentationPresets: demo.demoContract.presentationPresets,
      },
    }),
    [catalog.entries, demo],
  );
  const presentationPresets = demo.demoContract.presentationPresets
    ?? catalog.targets[demo.entry.targetBlueprintId]?.presentationPresets
    ?? [];
  const resolvedPresentationContext = resolvePresentationContext(
    presentationContext,
    presentationPresets,
    demo.entry.defaultContext,
  );

  const contexts = React.useMemo<Record<string, SharedContextStore>>(() => {
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
      request: null,
      receipt: null,
      commands: {},
      presentationContext: resolvedPresentationContext?.context ?? null,
      presentationPresetId: resolvedPresentationContext?.id ?? null,
      participantConfigurationRequest: null,
      agentModeRequest: null,
      authorizationRequest: null,
      inspection,
      ...(harnessControlState && typeof harnessControlState === "object" && !Array.isArray(harnessControlState)
        ? structuredClone(harnessControlState)
        : {}),
    } as unknown as Json;
    control.apply([{ op: "set", path: "control", value: controlSeed }]);
    next.control = control;

    const scenarioPlan = demo.scenarioPlan;
    const pace = scenarioPlan.pace.default;
    const demoContext = SharedContextStore.create(["demo"]);
    demoContext.apply([{ op: "set", path: "demo", value: {
      enabled: true,
      act: 0,
      presenter: {
        pace,
        durationMs: pace === "auto" ? scenarioPlan.pace.autoDurationMs : scenarioPlan.pace.manualDurationMs,
        locked: false,
        advanceToken: 0,
      },
      request: null,
      timeline: [],
      selection: null,
    } }]);
    next.demo = demoContext;

    if (showControlHarness && blueprintState?.soc !== undefined) {
      const soc = SharedContextStore.create(["soc"]);
      soc.apply([{ op: "set", path: "soc", value: structuredClone(blueprintState.soc) as Json }]);
      next.soc = soc;
    }
    return next;
  }, [blueprintState, demo, harnessControlState, presentationPresets, resolvedPresentationContext, showControlHarness]);

  const targetHandlesControl = React.useMemo(() => {
    const runtime = ControlFace.openBlueprint(blueprint);
    return unwrap(runtime.document).root.edges?.react?.some(
      (reaction: Reaction) => typeof reaction.when === "string" && reaction.when.startsWith("control.commands."),
    ) ?? false;
  }, [blueprint]);

  const controlStore = contexts.control;
  const primaryBridge = React.useMemo<OrganismBridge>(() => ({
    wrapSource: (controller) => controlStore ? withDemoHumanGate(controller, controlStore, demo.controlContract) : controller,
    connect: (controller) => {
      if (!controlStore || targetHandlesControl) return;
      const processed = new Set<string>();
      const dispatch = () => {
        const request = controlStore.get("control.request") as unknown as ControlRequest | null;
        if (!request || request.command === "$human-gate") return;
        const key = `${request.id}:${request.commandIndex ?? 0}:${request.command}`;
        if (processed.has(key)) return;
        processed.add(key);
        void dispatchDemoControlRequest(controller, controlStore, demo.controlContract, request);
      };
      const unsubscribe = controlStore.subscribe(dispatch);
      dispatch();
      return unsubscribe;
    },
  }), [controlStore, demo.controlContract, targetHandlesControl]);

  React.useEffect(() => {
    if (!controlStore) return;
    if (resolvedPresentationContext && controlStore.get("control.presentationPresetId") !== resolvedPresentationContext.id) {
      controlStore.apply([
        { op: "set", path: "control.presentationPresetId", value: resolvedPresentationContext.id },
        { op: "set", path: "control.presentationContext", value: resolvedPresentationContext.context as unknown as Json },
      ]);
    }
    const notify = () => {
      const selected = controlStore.get("control.presentationPresetId");
      if (typeof selected === "string" && selected) onPresentationPresetChange?.(selected);
    };
    const unsubscribe = controlStore.subscribe(notify);
    notify();
    return unsubscribe;
  }, [controlStore, onPresentationPresetChange, resolvedPresentationContext]);

  const packageCompanions = React.useMemo<CompositionOrganism[]>(() => {
    const list = [...companions];
    if (harnessBundle) list.push({ id: "gik-control-harness", bundle: harnessBundle });
    list.push({ id: "demo-runner", bundle: runnerBundle });
    return list;
  }, [companions, harnessBundle, runnerBundle]);

  return (
    <BlueprintHost
      blueprint={blueprint}
      native={native}
      companions={packageCompanions}
      contexts={contexts}
      primaryBridge={primaryBridge}
      className={className}
      style={compositionStyle}
    />
  );
}
