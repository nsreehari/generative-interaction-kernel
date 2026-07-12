import assert from "node:assert/strict";
import { test } from "vitest";

import { compileInteraction, type InteractionSpec } from "../../../interaction/src/index";
import { briefingProfile } from "./index";

test("briefing sample profile: loadProfile validates + resolves the authored artifacts", () => {
  assert.equal(briefingProfile.artifact.payload.id, "briefing");
  // a non-genui kind resolves the same way — the engine is generic over the layer graph.
  assert.equal(briefingProfile.artifact.payload.kind, "briefing-profile");
  assert.deepEqual(
    briefingProfile.stages.map((stage) => `${stage.fromLayer.kind}->${stage.toLayer.kind}`),
    ["interaction->presentation", "presentation->runtime-document"]
  );
});

test("briefing sample profile lowers an interaction to a runtime document", () => {
  const spec: InteractionSpec = { interaction: "investigate", subject: "incident" };
  const doc = compileInteraction(spec, { surface: "desktop" }, briefingProfile);

  assert.equal(doc.root.capability, "ui:board");
  assert.ok((doc.root.edges?.children?.length ?? 0) > 0, "every facet becomes a briefing region");
});
