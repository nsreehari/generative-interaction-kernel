import assert from "node:assert/strict";
import { test } from "vitest";
import type { SerializableBundle } from "@gik/react";
import { createHostCompositionBundle } from "./host-composition";

function embeddedApps(harnessId?: string | null, demoId?: string | null): string[] {
  const bundle = createHostCompositionBundle("live-workspace-soc", harnessId, demoId) as SerializableBundle;
  return (bundle.document.payload.root.edges?.children ?? []).map((child) => String(child.props?.app));
}

test("host composition supports every optional harness and runner mode", () => {
  assert.deepEqual(embeddedApps(), ["live-workspace-soc"]);
  assert.deepEqual(embeddedApps("gik-control-harness"), ["live-workspace-soc", "gik-control-harness"]);
  assert.deepEqual(embeddedApps(null, "demo-runner"), ["live-workspace-soc", "demo-runner"]);
  assert.deepEqual(embeddedApps("gik-control-harness", "demo-runner"), [
    "live-workspace-soc",
    "gik-control-harness",
    "demo-runner",
  ]);
});
