import seedBundle from "../apps/browser-host/public/bootstrap/sample-blueprints.bundle.json" with { type: "json" };
import {
	createBlueprintCatalogSnapshot,
	installSampleBlueprintCatalog,
	parseBlueprintCatalogBundle,
} from "../shared/blueprint-catalog";

installSampleBlueprintCatalog(createBlueprintCatalogSnapshot(parseBlueprintCatalogBundle(seedBundle)));