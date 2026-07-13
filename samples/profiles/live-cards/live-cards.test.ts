import assert from "node:assert/strict";
import { test } from "vitest";

import { compileInteraction, type InteractionSpec } from "../../../interaction/src/index";
import { loadProfile } from "@gik/profile-genui";
import liveCardsProfileJson from "./profile.json" with { type: "json" };
import liveCardsInteractionRecipeJson from "./interaction-to-presentation.recipe.json" with { type: "json" };
import liveCardsRuntimeRecipeJson from "./presentation-to-runtime.recipe.json" with { type: "json" };

const liveCardsProfile = loadProfile(liveCardsProfileJson, [
  liveCardsInteractionRecipeJson,
  liveCardsRuntimeRecipeJson,
]);

test("live-cards sample profile resolves the authored layer chain", () => {
  assert.equal(liveCardsProfile.artifact.payload.id, "live-cards");
  assert.equal(liveCardsProfile.artifact.payload.kind, "genui-profile");
  assert.deepEqual(
    liveCardsProfile.stages.map((stage) => `${stage.fromLayer.kind}->${stage.toLayer.kind}`),
    ["interaction->presentation", "presentation->runtime-document"]
  );
});

test("live-cards sample profile lowers an interaction to a runtime document", () => {
  const spec: InteractionSpec = { interaction: "review", subject: "portfolio" };
  const doc = compileInteraction(spec, { surface: "desktop" }, liveCardsProfile);

  assert.equal(doc.root.capability, "ui:board");
  assert.ok((doc.root.edges?.children?.length ?? 0) > 0, "the lowered board should contain runtime children");
});