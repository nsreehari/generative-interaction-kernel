// Engine test fixture: the live-cards profile loaded from the shared JSON fixtures in
// `schemas/fixtures/`, kept face-local so the face tests do not import sample-authored data.

import {
  loadBlueprint,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
  type LayerRecipe,
  type BlueprintArtifact,
} from "@gik/profile";
import liveCardsBlueprintJson from "../../samples/profiles/live-cards/blueprint.json" with { type: "json" };

export const liveCardsProfile = loadBlueprint<LayerRecipe>(
  liveCardsBlueprintJson as BlueprintArtifact<LayerRecipe>,
  resolveProfileTemplateResource,
  resolveProfileTemplate
);
