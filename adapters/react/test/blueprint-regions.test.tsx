import assert from "node:assert/strict";
import React from "react";
import { test } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import { createBlueprint, type BlueprintArtifact, type BlueprintDefinition } from "@gik-ai/blueprint";
import { createMemoryStorage } from "@gik-ai/durable-runtime/storage/memory";
import {
  BlueprintHost,
  BlueprintProvider,
} from "../src/primitives/blueprint-host";
import {
  BlueprintRegion,
  BlueprintRegionError,
  useBlueprintRegions,
} from "../src/primitives/blueprint-regions";
import { BlueprintProvider as DurableBlueprintProvider } from "../src/primitives/durable-blueprint-host";
import { createNativeBlueprintWorker } from "../src/durable-blueprint-worker";
import type { ProjectionView, ProviderResolver } from "../src/registry";

const Label: ProjectionView = ({ node }) => (
  <div data-view={node.id}>{String(node.props.value ?? "")}</div>
);

const Counter: ProjectionView = ({ node, emit }) => (
  <button data-view={node.id} onClick={() => void emit("increment")}>
    {String(node.props.value ?? "")}
  </button>
);

const resolveLeavesProvider: ProviderResolver = (from) =>
  from === "app" ? { label: Label, counter: Counter } : undefined;

function shellBlueprint(overrides: { id?: string } = {}): BlueprintArtifact {
  return createBlueprint({
    id: overrides.id ?? "shell",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program", capabilities: [] }],
    projectionRecipes: [],
    runtime: {
      externals: { projectionViews: { app: { from: "app", use: ["label", "counter"] } } },
      state: { counter: { value: 1 }, title: { text: "Shell" } },
    },
    cells: {
      heading: {
        id: "heading",
        potentialViews: {
          primary: { capability: "app:label", bindings: { value: { from: "title.text" } }, region: "command-bar" },
        },
      },
      tally: {
        id: "tally",
        potentialViews: {
          primary: { capability: "app:counter", bindings: { value: { from: "counter.value" } }, region: "primary" },
        },
        events: { increment: { payloadSchema: { type: "object" } } },
        behavior: {
          on: { increment: [{ do: "assign", target: "counter.value", args: { value: 7 } }] },
        },
      },
      note: {
        id: "note",
        potentialViews: {
          primary: { capability: "app:label", bindings: { value: { from: "counter.value" } }, region: "sidebar" },
        },
      },
    },
    presentation: {
      slots: [
        "shell",
        { id: "command-bar", region: "shell" },
        { id: "sidebar", region: "shell" },
        { id: "primary", region: "shell" },
      ],
      root: "shell",
      allowedCapabilities: ["app:label", "app:counter"],
      exportedRegions: [
        { name: "command-bar", slot: "command-bar", required: true },
        { name: "sidebar", slot: "sidebar" },
        { name: "primary", slot: "primary", required: true },
      ],
    },
  } as BlueprintDefinition);
}

function headlessHostedBlueprint(): BlueprintArtifact {
  return createBlueprint({
    id: "headless-parent",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program", capabilities: [] }],
    projectionRecipes: [],
    runtime: { state: {} },
    cells: {
      child: {
        id: "child",
        blueprint: { inline: shellBlueprint({ id: "headless-child" }) },
      },
    },
    presentation: {
      slots: ["shell", { id: "primary", region: "shell" }],
      root: "shell",
      allowedCapabilities: ["gik:blueprint"],
      exportedRegions: [{ name: "primary", slot: "primary" }],
    },
  } as BlueprintDefinition);
}

function memoryRef(value: string): string {
  return `b64:${Buffer.from(JSON.stringify({ kind: "memory", value })).toString("base64url")}`;
}

function durableRuntime() {
  const id = crypto.randomUUID();
  const ref = memoryRef(`blueprint-regions:${id}`);
  return {
    runtimeId: `blueprint-regions:${id}`,
    providers: { memory: createMemoryStorage() },
    refs: { stateRef: ref, journalRef: ref, effectsQueueRef: ref },
  };
}

function viewIds(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAll((instance) => typeof instance.props["data-view"] === "string", { deep: true })
    .map((instance) => String(instance.props["data-view"]));
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

class RegionErrorBoundary extends React.Component<
  { onError: (error: unknown) => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onError(error);
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

test("mounts exported regions at separate host locations from one Blueprint runtime", async () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <BlueprintProvider blueprint={shellBlueprint()} resolveLeavesProvider={resolveLeavesProvider}>
        <div data-shell="bar"><BlueprintRegion name="command-bar" /></div>
        <div data-shell="main"><BlueprintRegion name="primary" /></div>
      </BlueprintProvider>,
    );
  });
  await settle();

  const bar = renderer!.root.find((instance) => instance.props["data-shell"] === "bar");
  const main = renderer!.root.find((instance) => instance.props["data-shell"] === "main");
  assert.deepEqual(
    bar.findAll((instance) => typeof instance.props["data-view"] === "string").map((i) => String(i.props["data-view"])),
    ["heading--primary--in-command-bar"],
  );
  assert.deepEqual(
    main.findAll((instance) => typeof instance.props["data-view"] === "string").map((i) => String(i.props["data-view"])),
    ["tally--primary--in-primary"],
  );
  // An optional region nobody mounted never instantiates its projection view.
  assert.equal(viewIds(renderer!).includes("note--primary--in-sidebar"), false);
});

test("every mounted region shares one controller, state, and event dispatch", async () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <BlueprintProvider blueprint={shellBlueprint()} resolveLeavesProvider={resolveLeavesProvider}>
        <BlueprintRegion name="command-bar" />
        <BlueprintRegion name="sidebar" />
        <BlueprintRegion name="primary" />
      </BlueprintProvider>,
    );
  });
  await settle();

  const before = renderer!.root.find((instance) => instance.props["data-view"] === "note--primary--in-sidebar");
  assert.equal(before.children[0], "1");

  await act(async () => {
    renderer!.root
      .find((instance) => instance.props["data-view"] === "tally--primary--in-primary")
      .props.onClick();
  });
  await settle();

  // A region mounted elsewhere observes the transition the primary region dispatched: one instance.
  const after = renderer!.root.find((instance) => instance.props["data-view"] === "note--primary--in-sidebar");
  assert.equal(after.children[0], "7");
});

test("region discovery reports exported metadata for the running Blueprint", async () => {
  const discovered: { name: string; required: boolean }[] = [];
  function Discovery(): React.ReactElement | null {
    for (const region of useBlueprintRegions()) {
      discovered.push({ name: region.name, required: region.required });
    }
    return null;
  }

  await act(async () => {
    TestRenderer.create(
      <BlueprintProvider
        blueprint={shellBlueprint()}
        resolveLeavesProvider={resolveLeavesProvider}
        onMissingRequiredRegions={() => undefined}
      >
        <Discovery />
      </BlueprintProvider>,
    );
  });
  await settle();

  assert.deepEqual(discovered.slice(0, 3), [
    { name: "command-bar", required: true },
    { name: "sidebar", required: false },
    { name: "primary", required: true },
  ]);
});

test("an unknown region request fails with a deterministic host-facing error", async () => {
  const errors: unknown[] = [];
  await act(async () => {
    TestRenderer.create(
      <RegionErrorBoundary onError={(error) => errors.push(error)}>
        <BlueprintProvider blueprint={shellBlueprint()} resolveLeavesProvider={resolveLeavesProvider}>
          <BlueprintRegion name="footer" />
        </BlueprintProvider>
      </RegionErrorBoundary>,
    );
  });
  await settle();

  const [error] = errors;
  assert.ok(error instanceof BlueprintRegionError);
  assert.match(error.message, /does not export presentation region 'footer'/);
  assert.match(error.message, /command-bar, sidebar, primary/);
});

test("mounting one region twice fails with a deterministic host-facing error", async () => {
  const errors: unknown[] = [];
  await act(async () => {
    TestRenderer.create(
      <RegionErrorBoundary onError={(error) => errors.push(error)}>
        <BlueprintProvider blueprint={shellBlueprint()} resolveLeavesProvider={resolveLeavesProvider}>
          <BlueprintRegion name="primary" />
          <BlueprintRegion name="command-bar" />
          <BlueprintRegion name="primary" />
        </BlueprintProvider>
      </RegionErrorBoundary>,
    );
  });
  await settle();

  const [error] = errors;
  assert.ok(error instanceof BlueprintRegionError);
  assert.match(error.message, /region 'primary' is already mounted/);
});

test("a region mounted outside a provider fails with a deterministic host-facing error", () => {
  assert.throws(
    () => TestRenderer.create(<BlueprintRegion name="primary" />),
    (error: unknown) => error instanceof BlueprintRegionError
      && /must be rendered inside the BlueprintProvider/.test(error.message),
  );
});

test("required regions left unmounted report an actionable diagnostic; optional ones do not", async () => {
  const reported: string[][] = [];
  await act(async () => {
    TestRenderer.create(
      <BlueprintProvider
        blueprint={shellBlueprint()}
        resolveLeavesProvider={resolveLeavesProvider}
        onMissingRequiredRegions={(regions, message) => {
          reported.push([...regions]);
          assert.match(message, /requires presentation region\(s\) command-bar/);
        }}
      >
        <BlueprintRegion name="primary" />
      </BlueprintProvider>,
    );
  });
  await settle();

  assert.ok(reported.length > 0);
  for (const regions of reported) assert.deepEqual(regions, ["command-bar"]);
});

test("mounting every required region reports no diagnostic", async () => {
  let reports = 0;
  await act(async () => {
    TestRenderer.create(
      <BlueprintProvider
        blueprint={shellBlueprint()}
        resolveLeavesProvider={resolveLeavesProvider}
        onMissingRequiredRegions={() => { reports += 1; }}
      >
        <BlueprintRegion name="command-bar" />
        <BlueprintRegion name="primary" />
      </BlueprintProvider>,
    );
  });
  await settle();

  assert.equal(reports, 0);
});

test("changing provider externalContext re-materializes and re-publishes the region set", async () => {
  const adaptive = createBlueprint({
    id: "adaptive-shell",
    kind: "intent-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [
      { id: "intent", kind: "interaction-intent", capabilities: [] },
      { id: "runtime", kind: "runtime-program", capabilities: [] },
    ],
    projectionRecipes: [{
      id: "intent-to-runtime",
      from: "intent",
      to: "runtime",
      representations: [
        {
          id: "wide",
          views: { heading: { primary: { capability: "app:label", bindings: { value: { from: "title.text" } }, region: "command-bar" } } },
          presentation: {
            slots: ["shell", { id: "command-bar", region: "shell" }, { id: "primary", region: "shell" }],
            root: "shell",
            exportedRegions: [
              { name: "command-bar", slot: "command-bar" },
              { name: "primary", slot: "primary" },
            ],
          },
        },
        {
          id: "compact",
          when: "externalContext.device = 'phone'",
          views: { heading: { primary: { capability: "app:label", bindings: { value: { from: "title.text" } }, region: "primary" } } },
          presentation: {
            slots: ["shell", { id: "primary", region: "shell" }],
            root: "shell",
            exportedRegions: [{ name: "primary", slot: "primary" }],
          },
        },
      ],
      fallback: "wide",
    }],
    runtime: {
      externals: { projectionViews: { app: { from: "app", use: ["label", "counter"] } } },
      state: { title: { text: "Shell" } },
    },
    cells: {
      heading: {
        id: "heading",
        potentialViews: {
          primary: { capability: "app:label", bindings: { value: { from: "title.text" } }, region: "command-bar" },
        },
      },
    },
    presentation: {
      slots: ["shell", { id: "command-bar", region: "shell" }, { id: "primary", region: "shell" }],
      root: "shell",
      allowedCapabilities: ["app:label"],
    },
  } as BlueprintDefinition);

  const names: string[][] = [];
  function Discovery(): React.ReactElement | null {
    names.push(useBlueprintRegions().map((region) => region.name));
    return null;
  }
  const Shell = ({ device }: { device: string }): React.ReactElement => (
    <BlueprintProvider
      blueprint={adaptive}
      resolveLeavesProvider={resolveLeavesProvider}
      externalContext={{ device }}
    >
      <Discovery />
      <BlueprintRegion name="primary" />
    </BlueprintProvider>
  );

  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(<Shell device="desktop" />);
  });
  await settle();
  assert.deepEqual(names.at(-1), ["command-bar", "primary"]);

  await act(async () => {
    renderer!.update(<Shell device="phone" />);
  });
  await settle();
  assert.deepEqual(names.at(-1), ["primary"]);
  assert.deepEqual(viewIds(renderer!), ["heading--primary--in-primary"]);
});

test("the durable provider mounts the same exported regions over one durable runtime", async () => {
  const blueprint = shellBlueprint({ id: "durable-shell" });
  const runtime = durableRuntime();
  const worker = createNativeBlueprintWorker({ blueprint, runtime, native: {} });
  let renderer: TestRenderer.ReactTestRenderer | undefined;

  await act(async () => {
    renderer = TestRenderer.create(
      <DurableBlueprintProvider
        blueprint={blueprint}
        runtime={runtime}
        worker={worker}
        resolveLeavesProvider={resolveLeavesProvider}
      >
        <div data-shell="bar"><BlueprintRegion name="command-bar" /></div>
        <div data-shell="main"><BlueprintRegion name="primary" /></div>
        <div data-shell="side"><BlueprintRegion name="sidebar" /></div>
      </DurableBlueprintProvider>,
    );
  });
  await settle();

  assert.deepEqual(viewIds(renderer!), [
    "heading--primary--in-command-bar",
    "tally--primary--in-primary",
    "note--primary--in-sidebar",
  ]);

  await act(async () => {
    renderer!.root
      .find((instance) => instance.props["data-view"] === "tally--primary--in-primary")
      .props.onClick();
  });
  await settle();

  assert.equal(
    renderer!.root.find((instance) => instance.props["data-view"] === "note--primary--in-sidebar").children[0],
    "7",
  );
  renderer!.unmount();
  worker.stop();
});

test("single-root BlueprintHost still renders the whole presentation, exports or not", async () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <BlueprintHost blueprint={shellBlueprint()} resolveLeavesProvider={resolveLeavesProvider} />,
    );
  });
  await settle();

  assert.deepEqual(viewIds(renderer!), [
    "heading--primary--in-command-bar",
    "note--primary--in-sidebar",
    "tally--primary--in-primary",
  ]);
});

test("headless hosted Blueprint Cells execute once under the in-memory region provider", async () => {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <BlueprintProvider blueprint={headlessHostedBlueprint()} resolveLeavesProvider={resolveLeavesProvider}>
        <BlueprintRegion name="primary" />
      </BlueprintProvider>,
    );
  });
  await settle();

  assert.equal(
    viewIds(renderer!).filter((id) => id === "heading--primary--in-command-bar").length,
    1,
  );
});

test("headless hosted Blueprint Cells execute once under the durable region provider", async () => {
  const blueprint = headlessHostedBlueprint();
  const runtime = durableRuntime();
  const worker = createNativeBlueprintWorker({ blueprint, runtime, native: {} });
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <DurableBlueprintProvider
        blueprint={blueprint}
        runtime={runtime}
        worker={worker}
        resolveLeavesProvider={resolveLeavesProvider}
      >
        <BlueprintRegion name="primary" />
      </DurableBlueprintProvider>,
    );
  });
  await settle();

  assert.equal(
    viewIds(renderer!).filter((id) => id === "heading--primary--in-command-bar").length,
    1,
  );
  renderer!.unmount();
  worker.stop();
});

test("nested hosted Blueprint regions stay scoped to the child instance", async () => {
  const child = shellBlueprint({ id: "child-shell" });
  const parent = createBlueprint({
    id: "parent-shell",
    kind: "runtime-blueprint",
    version: "1",
    serviceTiers: [{ id: "runtime", kind: "runtime-program" }],
    serviceRecipes: [],
    projectionTiers: [{ id: "runtime", kind: "runtime-program", capabilities: [] }],
    projectionRecipes: [],
    runtime: {
      externals: { projectionViews: { app: { from: "app", use: ["label", "counter"] } } },
      state: {},
    },
    cells: {
      analysis: {
        id: "analysis",
        blueprint: { inline: child },
        potentialViews: { primary: { capability: "gik:blueprint", region: "primary" } },
      },
    },
    presentation: {
      slots: ["shell", { id: "primary", region: "shell" }],
      root: "shell",
      allowedCapabilities: ["gik:blueprint"],
      exportedRegions: [{ name: "primary", slot: "primary" }],
    },
  } as BlueprintDefinition);

  const parentRegions: string[][] = [];
  function Discovery(): React.ReactElement | null {
    parentRegions.push(useBlueprintRegions().map((region) => region.name));
    return null;
  }

  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <BlueprintProvider blueprint={parent} resolveLeavesProvider={resolveLeavesProvider}>
        <Discovery />
        <BlueprintRegion name="primary" />
      </BlueprintProvider>,
    );
  });
  await settle();

  // The parent only ever discovers its OWN exports, and the hosted child renders its whole
  // presentation inside the parent's region rather than exporting regions upward.
  assert.deepEqual(parentRegions.at(-1), ["primary"]);
  const rendered = viewIds(renderer!);
  assert.ok(rendered.includes("heading--primary--in-command-bar"));
  assert.ok(rendered.includes("note--primary--in-sidebar"));
});
