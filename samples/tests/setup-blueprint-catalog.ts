import seedBundle from "../apps/host/public/bootstrap/sample-blueprints.bundle.json" with { type: "json" };
import { createBlueprintCatalogSnapshot, parseBlueprintCatalogBundle } from "../shared/blueprint-catalog";
import { installSampleBlueprintCatalog } from "../shared/blueprints";

installSampleBlueprintCatalog(createBlueprintCatalogSnapshot(parseBlueprintCatalogBundle(seedBundle)));