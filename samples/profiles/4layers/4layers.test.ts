import assert from "node:assert/strict";
import { test } from "vitest";

import { loadProfile } from "@gik/profile";
import { runProfile, type LayerRecipe, type WorkflowSpec } from "../genui";
import profileJson from "./profile.json" with { type: "json" };
import workflowRecipeJson from "./workflow-to-interaction.recipe.json" with { type: "json" };
import interactionRecipeJson from "./interaction-to-presentation.recipe.json" with { type: "json" };
import runtimeRecipeJson from "./presentation-to-runtime.recipe.json" with { type: "json" };
import { resolveProfileTemplate, resolveProfileTemplateResource } from "../template-resolver";

const fourLayersProfile = loadProfile<LayerRecipe>(profileJson, [
  workflowRecipeJson,
  interactionRecipeJson,
  runtimeRecipeJson,
], resolveProfileTemplateResource, resolveProfileTemplate);

test("4layers sample profile resolves the authored layer chain", () => {
  assert.equal(fourLayersProfile.artifact.payload.id, "4layers");
  assert.equal(fourLayersProfile.artifact.payload.kind, "genui-profile");
  assert.deepEqual(
    fourLayersProfile.stages.map((stage) => `${stage.fromLayer.kind}->${stage.toLayer.kind}`),
    ["workflow->interaction", "interaction->presentation", "presentation->runtime-doc"]
  );
});

test("4layers sample profile lowers a workflow to a runtime document", () => {
  const seed: WorkflowSpec = { workflow: "operations-monitoring", subject: "service health" };
  const doc = runProfile(fourLayersProfile, seed, { surface: "desktop" }) as { root: { capability: string; edges?: { children?: unknown[] } } };

  assert.equal(doc.root.capability, "ui:board");
  assert.ok((doc.root.edges?.children?.length ?? 0) > 0, "the lowered board should contain runtime children");
});