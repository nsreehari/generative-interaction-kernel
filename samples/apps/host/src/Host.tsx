// The ONE generic host app opens a Blueprint selected by `?b=<id>` and adapts its lowered runtime
// to BundleHost. Ordinary Bundle artifacts are previewed inside the manage-bundles Blueprint. A demo
// run (`?demo=<id>`) is delegated wholesale to GikDemoBlueprintHost; the host keeps only URL
// canonicalization, the non-demo mounting paths, and the switcher overlay.

import React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import {
  BundleHost,
  BundleRegistryProvider,
  SharedContextStore,
  useBundleRegistry,
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
import { demoCatalog } from "../../../shared/demo-catalog";
import { GikDemoBlueprintHost } from "../../../shared/GikDemoBlueprintHost";

const useStyles = makeStyles({
  unknownBundle: {
    padding: tokens.spacingHorizontalXXL,
    color: "var(--text)",
  },
});

/** Reflect the selected presentation preset into the URL (replace, no history entry). */
function syncPresentationUrl(presetId: string): void {
  const url = writePresentationNavigation(window.location.href, presetId);
  if (url !== window.location.href) window.history.replaceState(null, "", url);
}

export function Host(): React.ReactElement {
  // One registry for the life of the app; every BundleHost and every `embed props.app` resolves it.
  const query = readHostQuery(window.location.search);
  const targetId = query.targetId ?? DEFAULT_BLUEPRINT;
  const { demoId, harnessId, presentationContext } = query;
  const registry = React.useMemo(() => createHostRegistry(demoId, targetId), [demoId, targetId]);
  const presentationPresets = React.useMemo(
    () => demoCatalog.targets[targetId]?.presentationPresets ?? [],
    [targetId]
  );
  const resolvedPresentationContext = resolvePresentationContext(presentationContext, presentationPresets);
  // Non-demo shared contexts only; a demo run's contexts are owned by GikDemoBlueprintHost.
  const contexts = React.useMemo<Record<string, SharedContextStore>>(() => {
    if (demoId) return {};
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
    if (harnessId || presentationPresets.length > 0 || resolvedPresentationContext) {
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
    if (harnessId && targetState) {
      const seed = targetState.soc;
      if (seed !== undefined) {
        const soc = SharedContextStore.create(["soc"]);
        soc.apply([{ op: "set", path: "soc", value: structuredClone(seed) }]);
        next.soc = soc;
      }
    }
    return next;
  }, [demoId, harnessId, presentationPresets, registry, resolvedPresentationContext, targetId]);
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
      syncPresentationUrl(selected);
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
      <HostView
        contexts={contexts}
        demoId={demoId}
        harnessId={harnessId}
        targetId={targetId}
        presentationContext={presentationContext}
        onPresentationPresetChange={syncPresentationUrl}
      />
    </BundleRegistryProvider>
  );
}

function HostView({
  contexts,
  demoId,
  harnessId,
  targetId,
  presentationContext,
  onPresentationPresetChange,
}: {
  contexts: Record<string, SharedContextStore>;
  demoId: string | null;
  harnessId: string | null;
  targetId: string;
  presentationContext: string | null;
  onPresentationPresetChange: (presetId: string) => void;
}): React.ReactElement {
  const styles = useStyles();
  const registry = useBundleRegistry();
  const id = targetId;
  const entry = registry?.get(id);
  const mounted = React.useMemo(() => {
    if (entry?.kind === "native-root") return <entry.Root />;
    if (entry?.kind === "bundle") {
      if (demoId) {
        return (
          <GikDemoBlueprintHost
            blueprintId={id}
            demoId={demoId}
            showControlHarness={Boolean(harnessId)}
            presentationContext={presentationContext}
            onPresentationPresetChange={onPresentationPresetChange}
          />
        );
      }
      const bundle = harnessId ? createHostCompositionBundle(id, harnessId, null) : entry.make();
      return <BundleHost bundle={bundle} contexts={contexts} />;
    }
    return <p className={styles.unknownBundle}>Unknown Blueprint: {id}</p>;
  }, [contexts, demoId, entry, harnessId, id, onPresentationPresetChange, presentationContext, styles.unknownBundle]);

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
