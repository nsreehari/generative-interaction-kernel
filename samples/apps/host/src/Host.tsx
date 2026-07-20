// The ONE generic host app opens a Blueprint selected by `?b=<id>` and adapts its lowered runtime
// to BundleHost. Ordinary Bundle artifacts are previewed inside the manage-bundles Blueprint.

import React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import {
  BundleHost,
  BundleContextsProvider,
  BundleRegistryProvider,
  GenUIRoot,
  SharedContextStore,
  buildBundleRegistry,
  loadBundle,
  type Bundle,
  useBundleContextSync,
  useBundleRegistry,
  useProjectionProviderResolver,
  useRegistryIds,
} from "@gik/react";
import { createHostRegistry, DEFAULT_BLUEPRINT, resolveBundleProjectionViews } from "./bundles";
import { createHostCompositionBundle } from "./host-composition";
import {
  canonicalizeHostUrl,
  readHostQuery,
  resolvePresentationContext,
  writePresentationNavigation,
} from "./host-query";
import { switcherBundle } from "../../../bundles/approot/switcher/projection_views";
import { sampleProfileComponents } from "../../../bundles/floor/projection_views/profile";
import { demoCatalog, resolveDemoComposition } from "../../../shared/demo-catalog";
import { dispatchDemoControlRequest, withDemoHumanGate } from "../../../bundles/demo-runner/effect_handlers/control-bridge";
import type { ControlRequest, OrganismControlContract } from "../../../shared/control-runtime";

const useStyles = makeStyles({
  unknownBundle: {
    padding: tokens.spacingHorizontalXXL,
    color: "var(--text)",
  },
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

export function Host(): React.ReactElement {
  // One registry for the life of the app; every BundleHost and every `embed props.app` resolves it.
  const query = readHostQuery(window.location.search);
  const targetId = query.targetId ?? DEFAULT_BLUEPRINT;
  const { demoId, harnessId, presentationContext } = query;
  const registry = React.useMemo(() => createHostRegistry(demoId, targetId), [demoId, targetId]);
  const demoComposition = React.useMemo(
    () => demoId ? resolveDemoComposition(demoId, targetId) : undefined,
    [demoId, targetId]
  );
  const presentationPresets = React.useMemo(
    () => demoComposition?.demoContract.presentationPresets ?? demoCatalog.targets[targetId]?.presentationPresets ?? [],
    [demoComposition, targetId]
  );
  const resolvedPresentationContext = resolvePresentationContext(
    presentationContext,
    presentationPresets,
    demoComposition?.entry.defaultContext
  );
  const contexts = React.useMemo<Record<string, SharedContextStore>>(() => {
    const next: Record<string, SharedContextStore> = {};
    const target = registry.get(targetId);
    const targetState = target?.kind === "bundle" ? target.make().state : undefined;
    const harness = harnessId ? registry.get(harnessId) : undefined;
    const harnessState = harness?.kind === "bundle" ? harness.make().state : undefined;
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
    if (demoId || harnessId || presentationPresets.length > 0 || resolvedPresentationContext) {
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
    }
    if (demoId && demoComposition) {
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
    }
    if (harnessId) {
      if (targetState) {
        const seed = targetState.soc;
        if (seed !== undefined) {
          const soc = SharedContextStore.create(["soc"]);
          soc.apply([{ op: "set", path: "soc", value: structuredClone(seed) }]);
          next.soc = soc;
        }
      }
    }
    return next;
  }, [demoComposition, demoId, harnessId, presentationPresets, registry, resolvedPresentationContext, targetId]);
  React.useEffect(() => {
    const canonicalUrl = canonicalizeHostUrl(window.location.href);
    if (canonicalUrl !== window.location.href) window.history.replaceState(null, "", canonicalUrl);
  }, []);
  React.useEffect(() => {
    const control = contexts.control;
    if (!control) return;
    const syncQuery = () => {
      const selected = control.get("control.presentationPresetId");
      if (typeof selected !== "string" || !selected) return;
      const url = writePresentationNavigation(window.location.href, selected);
      if (url !== window.location.href) window.history.replaceState(null, "", url);
    };
    const unsubscribe = control.subscribe(syncQuery);
    if (resolvedPresentationContext
      && control.get("control.presentationPresetId") !== resolvedPresentationContext.id) {
      control.apply([
        { op: "set", path: "control.presentationPresetId", value: resolvedPresentationContext.id },
        { op: "set", path: "control.presentationContext", value: resolvedPresentationContext.context as unknown as import("@gik/kernel").Json },
      ]);
    }
    syncQuery();
    return unsubscribe;
  }, [contexts, resolvedPresentationContext]);
  const resolveProvider = React.useCallback(
    (from: string) => (from === "profile" ? sampleProfileComponents : resolveBundleProjectionViews(from)),
    []
  );
  return (
    <BundleRegistryProvider registry={registry} resolveProvider={resolveProvider}>
      <HostView contexts={contexts} demoId={demoId} harnessId={harnessId} targetId={targetId} />
    </BundleRegistryProvider>
  );
}

function HostView({
  contexts,
  demoId,
  harnessId,
  targetId,
}: {
  contexts: Record<string, SharedContextStore>;
  demoId: string | null;
  harnessId: string | null;
  targetId: string;
}): React.ReactElement {
  const styles = useStyles();
  const registry = useBundleRegistry();
  const id = targetId;
  const entry = registry?.get(id);
  const mounted = React.useMemo(() => {
    if (entry?.kind === "native-root") return <entry.Root />;
    if (entry?.kind === "bundle") {
      if (demoId) {
        const runner = registry?.get("demo-runner");
        const harness = harnessId ? registry?.get(harnessId) : undefined;
        if (runner?.kind !== "bundle") return <p className={styles.unknownBundle}>Demo runner is unavailable.</p>;
        const { controlContract } = resolveDemoComposition(demoId, id);
        return (
          <DemoHostComposition
            contexts={contexts}
            controlContract={controlContract}
            target={entry.make()}
            harness={harness?.kind === "bundle" ? harness.make() : null}
            runner={runner.make()}
          />
        );
      }
      const bundle = harnessId || demoId
        ? createHostCompositionBundle(id, harnessId, demoId ? "demo-runner" : null)
        : entry.make();
      return <BundleHost bundle={bundle} contexts={contexts} />;
    }
    return <p className={styles.unknownBundle}>Unknown Blueprint: {id}</p>;
  }, [contexts, demoId, entry, harnessId, id, styles.unknownBundle]);

  // The switcher is itself a bundle, mounted through the same host as an overlay — so host chrome
  // rides the ambient, host-owned theme. Its list reacts to runtime register/unregister.
  const ids = useRegistryIds({ listable: true });
  const switcher = React.useMemo(
    () => switcherBundle([...ids], id),
    [ids, id]
  );
  return (
    <>
      {mounted}
      {demoId ? null : <BundleHost bundle={switcher} />}
    </>
  );
}

function DemoHostComposition({
  contexts,
  controlContract,
  target,
  harness,
  runner,
}: {
  contexts: Record<string, SharedContextStore>;
  controlContract: OrganismControlContract;
  target: Bundle;
  harness: Bundle | null;
  runner: Bundle;
}): React.ReactElement {
  const styles = useStyles();
  return (
    <div className={`gx-host-composition ${styles.demoComposition}`}>
      <DemoTargetHost bundle={target} contexts={contexts} controlContract={controlContract} />
      {harness ? <BundleHost bundle={harness} contexts={contexts} /> : null}
      <BundleHost bundle={runner} contexts={contexts} />
    </div>
  );
}

function DemoTargetHost({
  bundle,
  contexts,
  controlContract,
}: {
  bundle: Bundle;
  contexts: Record<string, SharedContextStore>;
  controlContract: OrganismControlContract;
}): React.ReactElement {
  const resolveProvider = useProjectionProviderResolver();
  const controller = React.useMemo(() => loadBundle(bundle, {
    contexts,
  }), [bundle, contexts]);
  useBundleContextSync(controller, contexts);
  const registry = React.useMemo(
    () => buildBundleRegistry(bundle, resolveProvider ?? undefined),
    [bundle, resolveProvider]
  );
  const processed = React.useRef(new Set<string>());
  const targetHandlesControl = bundle.document.payload.root.edges?.react?.some(
    (reaction) => typeof reaction.when === "string" && reaction.when.startsWith("control.commands.")
  ) ?? false;
  const source = React.useMemo(
    () => contexts.control ? withDemoHumanGate(controller, contexts.control, controlContract) : controller,
    [contexts.control, controlContract, controller]
  );
  React.useEffect(() => {
    const control = contexts.control;
    if (!control || targetHandlesControl) return;
    const dispatch = () => {
      const request = control.get("control.request") as unknown as ControlRequest | null;
      if (!request || request.command === "$human-gate") return;
      const key = `${request.id}:${request.commandIndex ?? 0}:${request.command}`;
      if (processed.current.has(key)) return;
      processed.current.add(key);
      void dispatchDemoControlRequest(controller, control, controlContract, request);
    };
    const unsubscribe = control.subscribe(dispatch);
    dispatch();
    return unsubscribe;
  }, [contexts, controlContract, controller, targetHandlesControl]);

  return (
    <BundleContextsProvider contexts={contexts}>
      <GenUIRoot source={source} registry={registry} />
    </BundleContextsProvider>
  );
}
