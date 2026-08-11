import seedBundle from "../catalog/bootstrap/sample-blueprints.bundle.json" with { type: "json" };
import {
	createBlueprintCatalogSnapshot,
	installSampleBlueprintCatalog,
	parseBlueprintCatalogBundle,
} from "../catalog/blueprint-catalog";

installSampleBlueprintCatalog(createBlueprintCatalogSnapshot(parseBlueprintCatalogBundle(seedBundle)));