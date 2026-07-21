// GikDemoBlueprintHost: the DEMO rung on top of BlueprintHost. It knows the GIK sample demo shape —
// the demo-runner panel, the optional control harness, and the control/demo/soc shared contexts that
// wire a target Blueprint to them. It resolves those companion bundles, seeds the shared contexts, and
// builds the control BRIDGE that lets the demo-runner drive the target (and completes human gates),
// then hands everything to the demo-agnostic BlueprintHost. URL/query concerns stay in the app host,
// which feeds resolved ids in and reacts to presentation-preset changes via `onPresentationPresetChange`.

import React from "react";
import { makeStyles, mergeClasses } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { SharedContextStore, type CompositionOrganism, type OrganismBridge } from "@gik/react";
import { buildInfrastructureBundle, resolveBlueprintBundle } from "./sample-bundles";
import { demoCatalog, resolveDemoComposition } from "./demo-catalog";
import { resolvePresentationContext } from "./presentation";
import { dispatchDemoControlRequest, withDemoHumanGate } from "../bundles/demo-runner/effect_handlers/control-bridge";
import type { ControlRequest } from "./control-runtime";
import { BlueprintHost } from "./BlueprintHost";

const DEFAULT_DEMO_BUNDLE_ID = "demo-runner";
const DEFAULT_CONTROL_BUNDLE_ID = "gik-control-harness";

const useStyles = makeStyles({
  demoComposition: {
    height: "100vh",
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr) auto",
    overflow: "hidden",
    "& > main": {
      minHeight: 0,
      overflowY: "auto",
    },
  },
});

export function GikDemoBlueprintHost({
  blueprintId,
  demoId,
  demoBundleId = DEFAULT_DEMO_BUNDLE_ID,
  controlBundleId = DEFAULT_CONTROL_BUNDLE_ID,
  showControlHarness = false,
  presentationContext,
  className,
  onPresentationPresetChange,
}: {
  /** The target Blueprint the demo drives. */
  blueprintId: string;
  /** The scenario (demo) id that scripts the run. */
  demoId: string;
  /** The demo-runner bundle id (defaults to "demo-runner"). */
  demoBundleId?: string;
  /** The control-harness bundle id (defaults to "gik-control-harness"). */
  controlBundleId?: string;
  /** Whether to mount the control harness alongside the target + runner. */
  showControlHarness?: boolean;
  /** Requested presentation preset id (raw, from the host's query). */
  presentationContext?: string | null;
  /** className merged onto the composition container. */
  className?: string;
  /** Fired with the active preset id on seed and whenever it changes (host syncs its URL). */
  onPresentationPresetChange?: (presetId: string) => void;
}): React.ReactElement {
  const styles = useStyles();
  const harnessId = showControlHarness ? controlBundleId : null;

  const demoComposition = React.useMemo(
    () => resolveDemoComposition(demoId, blueprintId),
    [demoId, blueprintId]
  );
  const controlContract = demoComposition.controlContract;

  // Resolved once for reading (state seed + control-reaction detection); BlueprintHost mounts its own.
  const targetBundle = React.useMemo(() => resolveBlueprintBundle(blueprintId), [blueprintId]);
  const harnessBundle = React.useMemo(
    () => (harnessId ? buildInfrastructureBundle(harnessId) : null),
    [harnessId]
  );
  const runnerBundle = React.useMemo(
    () => buildInfrastructureBundle(demoBundleId, {
      runner: {
        plan: demoComposition.scenarioPlan,
        catalog: demoCatalog.entries,
        entry: demoComposition.entry,
        presentationPresets: demoComposition.demoContract.presentationPresets,
      },
    }),
    [demoBundleId, demoComposition]
  );

  const presentationPresets = React.useMemo(
    () => demoComposition.demoContract.presentationPresets
      ?? demoCatalog.targets[blueprintId]?.presentationPresets
      ?? [],
    [demoComposition, blueprintId]
  );
  const resolvedPresentationContext = resolvePresentationContext(
    presentationContext,
    presentationPresets,
    demoComposition.entry.defaultContext
  );

  const contexts = React.useMemo<Record<string, SharedContextStore>>(() => {
    const next: Record<string, SharedContextStore> = {};
    const targetState = targetBundle.state;
    const harnessState = harnessBundle?.state;
    const inspection = targetState?.inspection
      && typeof targetState.inspection === "object"
      && !Array.isArray(targetState.inspection)
      ? structuredClone(targetState.inspection)
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
      ...(harnessState?.control
      && typeof harnessState.control === "object"
      && !Array.isArray(harnessState.control)
        ? structuredClone(harnessState.control)
        : {
          request: null,
          receipt: null,
          commands: {},
          presentationContext: resolvedPresentationContext?.context ?? null,
          presentationPresetId: resolvedPresentationContext?.id ?? null,
          participantConfigurationRequest: null,
          agentModeRequest: null,
          authorizationRequest: null,
        }),
      inspection,
      presentationContext: (resolvedPresentationContext?.context ?? null) as Json,
      presentationPresetId: resolvedPresentationContext?.id ?? null,
    } as unknown as Json;
    control.apply([{ op: "set", path: "control", value: controlSeed }]);
    next.control = control;

    const demo = SharedContextStore.create(["demo"]);
    const { scenarioPlan } = demoComposition;
    const pace = scenarioPlan.pace.default;
    demo.apply([{ op: "set", path: "demo", value: {
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
    next.demo = demo;

    if (harnessId && targetState) {
      const seed = targetState.soc;
      if (seed !== undefined) {
        const soc = SharedContextStore.create(["soc"]);
        soc.apply([{ op: "set", path: "soc", value: structuredClone(seed) }]);
        next.soc = soc;
      }
    }
    return next;
  }, [demoComposition, harnessBundle, harnessId, presentationPresets, resolvedPresentationContext, targetBundle]);

  // Whether the target reacts to control commands itself (then the demo-runner must NOT also dispatch).
  const targetHandlesControl = targetBundle.document.payload.root.edges?.react?.some(
    (reaction) => typeof reaction.when === "string" && reaction.when.startsWith("control.commands.")
  ) ?? false;

  const controlStore = contexts.control;
  const primaryBridge = React.useMemo<OrganismBridge>(() => ({
    wrapSource: (controller) =>
      controlStore ? withDemoHumanGate(controller, controlStore, controlContract) : controller,
    connect: (controller) => {
      if (!controlStore || targetHandlesControl) return;
      const processed = new Set<string>();
      const dispatch = () => {
        const request = controlStore.get("control.request") as unknown as ControlRequest | null;
        if (!request || request.command === "$human-gate") return;
        const key = `${request.id}:${request.commandIndex ?? 0}:${request.command}`;
        if (processed.has(key)) return;
        processed.add(key);
        void dispatchDemoControlRequest(controller, controlStore, controlContract, request);
      };
      const unsubscribe = controlStore.subscribe(dispatch);
      dispatch();
      return unsubscribe;
    },
  }), [controlStore, controlContract, targetHandlesControl]);

  // Seed the active preset into control and notify the host of preset changes (for URL sync).
  React.useEffect(() => {
    if (!controlStore) return;
    if (resolvedPresentationContext
      && controlStore.get("control.presentationPresetId") !== resolvedPresentationContext.id) {
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
  }, [controlStore, resolvedPresentationContext, onPresentationPresetChange]);

  const companions = React.useMemo<CompositionOrganism[]>(() => {
    const list: CompositionOrganism[] = [];
    if (harnessBundle && harnessId) list.push({ id: harnessId, bundle: harnessBundle });
    list.push({ id: demoBundleId, bundle: runnerBundle });
    return list;
  }, [harnessBundle, harnessId, runnerBundle, demoBundleId]);

  return (
    <BlueprintHost
      blueprintId={blueprintId}
      companions={companions}
      contexts={contexts}
      primaryBridge={primaryBridge}
      className={mergeClasses("gx-host-composition", styles.demoComposition, className)}
    />
  );
}
