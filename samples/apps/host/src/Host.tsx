// The ONE generic host app. There is no per-app shell anymore: this entry runs ANY bundle by id.
// It publishes a runtime `BundleRegistry` (seeded from samples/bundles/registry.json), picks a bundle
// (`?bundle=<id>`, defaulting to the samples overview), and mounts it — a JSON leaf through the shared
// `BundleHost`, or an irreducibly-native composition through its `Root`. Swapping the id renders a
// different app with zero code change here; registering a bundle at runtime makes it mountable live.

import React from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import {
  BundleHost,
  BundleRegistryProvider,
  SharedContextStore,
  sampleProfileComponents,
  useBundleRegistry,
  useRegistryIds,
} from "@gik/react";
import { createHostRegistry, DEFAULT_BUNDLE, resolveBundleProjectionViews } from "./bundles";
import { createHostCompositionBundle } from "./host-composition";
import { canonicalizeHostUrl, readHostQuery, writePresentationNavigation } from "./host-query";
import { switcherBundle } from "../../../bundles/approot/switcher/switcher";
import { resolveDemoComposition } from "../../../scenarios/catalog";

const useStyles = makeStyles({
  unknownBundle: {
    padding: tokens.spacingHorizontalXXL,
    color: "var(--text)",
  },
});

export function Host(): React.ReactElement {
  // One registry for the life of the app; every BundleHost and every `embed props.app` resolves it.
  const query = readHostQuery(window.location.search);
  const targetId = query.targetId ?? DEFAULT_BUNDLE;
  const { demoId, harnessId, presentationContext } = query;
  const registry = React.useMemo(() => createHostRegistry(demoId), [demoId]);
  const contexts = React.useMemo<Record<string, SharedContextStore>>(() => {
    const next: Record<string, SharedContextStore> = {};
    const target = registry.get(targetId);
    const targetState = target?.kind === "bundle" ? target.make().state : undefined;
    const harness = harnessId ? registry.get(harnessId) : undefined;
    const harnessState = harness?.kind === "bundle" ? harness.make().state : undefined;
    const inspection = targetState?.inspection && typeof targetState.inspection === "object"
      ? structuredClone(targetState.inspection)
      : { participants: [] };
    if (demoId || harnessId || presentationContext) {
      const control = SharedContextStore.create(["control"]);
      const controlSeed = harnessState?.control && typeof harnessState.control === "object"
        ? structuredClone(harnessState.control)
        : {
        request: null,
        receipt: null,
        commands: {},
        presentationContext: null,
        participantConfigurationRequest: null,
        agentModeRequest: null,
        authorizationRequest: null,
      };
      controlSeed.inspection = inspection;
      control.apply([{ op: "set", path: "control", value: controlSeed }]);
      next.control = control;
    }
    if (demoId) {
      const demo = SharedContextStore.create(["demo"]);
      const { scenarioPlan } = resolveDemoComposition(demoId);
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
  }, [demoId, harnessId, presentationContext, registry, targetId]);
  React.useEffect(() => {
    const canonicalUrl = canonicalizeHostUrl(window.location.href);
    if (canonicalUrl !== window.location.href) window.history.replaceState(null, "", canonicalUrl);
  }, []);
  React.useEffect(() => {
    const control = contexts.control;
    if (!control) return;
    const syncQuery = () => {
      const selected = control.get("control.presentationContext");
      if (typeof selected !== "string" || !selected) return;
      const url = writePresentationNavigation(window.location.href, selected);
      if (url !== window.location.href) window.history.replaceState(null, "", url);
    };
    const unsubscribe = control.subscribe(syncQuery);
    if (presentationContext && control.get("control.presentationContext") !== presentationContext) {
      control.apply([{ op: "set", path: "control.presentationContext", value: presentationContext }]);
    }
    return unsubscribe;
  }, [contexts, presentationContext]);
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
      const bundle = harnessId || demoId
        ? createHostCompositionBundle(id, harnessId, demoId ? "demo-runner" : null)
        : entry.make();
      return <BundleHost bundle={bundle} contexts={contexts} />;
    }
    return <p className={styles.unknownBundle}>Unknown bundle: {id}</p>;
  }, [contexts, demoId, entry, harnessId, id, styles.unknownBundle]);

  // The switcher is itself a bundle, mounted through the same host as an overlay — so host chrome
  // rides the ambient, host-owned theme. Its list reacts to runtime register/unregister.
  const ids = useRegistryIds({ listable: true });
  const switcher = React.useMemo(() => switcherBundle([...ids], id), [ids, id]);
  return (
    <>
      {mounted}
      <BundleHost bundle={switcher} />
    </>
  );
}
