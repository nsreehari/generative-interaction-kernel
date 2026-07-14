import assert from "node:assert/strict";
import { test } from "vitest";

import { loadProfile } from "@gik/profile";
import { runProfile, type InteractionSpec, type LayerRecipe } from "../genui";
import briefingProfileJson from "./profile.json" with { type: "json" };
import briefingRuntimeRecipeJson from "./interaction-to-runtime.recipe.json" with { type: "json" };
import { resolveProfileTemplate, resolveProfileTemplateResource } from "../template-resolver";

const briefingProfile = loadProfile<LayerRecipe>(briefingProfileJson, [
  briefingRuntimeRecipeJson,
], resolveProfileTemplateResource, resolveProfileTemplate);

test("briefing sample profile: loadProfile validates + resolves the authored artifacts", () => {
  assert.equal(briefingProfile.artifact.payload.id, "briefing");
  // a non-genui kind resolves the same way — the engine is generic over the layer graph.
  assert.equal(briefingProfile.artifact.payload.kind, "briefing-profile");
  assert.deepEqual(
    briefingProfile.stages.map((stage) => `${stage.fromLayer.kind}->${stage.toLayer.kind}`),
    ["agent-interaction->runtime-doc"]
  );
});

test("briefing sample profile lowers an interaction to a runtime document", () => {
  const spec: InteractionSpec = { interaction: "investigate", subject: "incident" };
  const doc = runProfile(briefingProfile, spec, { surface: "desktop" }) as { root: { capability: string; edges?: { children?: unknown[] } } };

  assert.equal(doc.root.capability, "ui:board");
  assert.ok((doc.root.edges?.children?.length ?? 0) > 0, "every facet becomes a briefing region");
});
