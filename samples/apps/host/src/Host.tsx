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
  const demoId = new URLSearchParams(window.location.search).get("demo");
  const registry = React.useMemo(() => createHostRegistry(demoId), [demoId]);
  const contexts = React.useMemo<Record<string, SharedContextStore>>(() => {
    if (!demoId) return {} as Record<string, SharedContextStore>;
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
      ack: null,
      commands: {},
    } }]);
    return { demo };
  }, [demoId]);
  const resolveProvider = React.useCallback(
    (from: string) => (from === "profile" ? sampleProfileComponents : resolveBundleProjectionViews(from)),
    []
  );
  return (
    <BundleRegistryProvider registry={registry} resolveProvider={resolveProvider}>
      <HostView contexts={contexts} />
    </BundleRegistryProvider>
  );
}

function HostView({ contexts }: { contexts: Record<string, SharedContextStore> }): React.ReactElement {
  const styles = useStyles();
  const registry = useBundleRegistry();
  const id = new URLSearchParams(window.location.search).get("bundle") ?? DEFAULT_BUNDLE;
  const entry = registry?.get(id);
  const mounted = React.useMemo(() => {
    if (entry?.kind === "native-root") return <entry.Root />;
    if (entry?.kind === "bundle") return <BundleHost bundle={entry.make()} contexts={contexts} />;
    return <p className={styles.unknownBundle}>Unknown bundle: {id}</p>;
  }, [contexts, entry, id, styles.unknownBundle]);

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
