import type { Bundle, SerializableBundle } from "@gik/react";

type CompositionChild = {
  capability: string;
  id: string;
  props: { app: string; unframed: boolean };
};

export function createHostCompositionBundle(
  targetId: string,
  harnessId?: string | null,
  demoRunnerId?: string | null
): Bundle {
  const children: CompositionChild[] = [
    { capability: "ui:embed", id: "host-target", props: { app: targetId, unframed: true } },
  ];
  if (harnessId) {
    children.push({ capability: "ui:embed", id: "host-control-harness", props: { app: harnessId, unframed: true } });
  }
  if (demoRunnerId) {
    children.push({ capability: "ui:embed", id: "host-demo-runner", props: { app: demoRunnerId, unframed: true } });
  }

  const composition: SerializableBundle = {
    manifest: {
      gik: "0.1",
      type: "manifest",
      payload: {
        version: "host-composition/1.0",
        expression: "jsonata",
        namespaces: [],
        contexts: ["soc", "control", "demo"],
        actions: [],
        capabilities: {
          "ui:screen": { propsSchema: { type: "object", additionalProperties: true }, slots: ["children"] },
          "ui:embed": { propsSchema: { type: "object", additionalProperties: true } },
        },
        externals: {
          projectionViews: {
            ui: { from: "floor", use: ["screen", "embed"] },
          },
        },
      },
    },
    document: {
      gik: "0.1",
      type: "document",
      payload: {
        root: {
          capability: "ui:screen",
          id: "host-composition",
          props: { className: "gx-host-composition" },
          edges: { children },
        },
      },
    },
    state: {},
  };
  return composition;
}
