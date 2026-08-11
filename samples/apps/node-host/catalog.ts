import seedJson from "../../catalog/bootstrap/sample-blueprints.bundle.json" with { type: "json" };
import {
  createBlueprintCatalogSnapshot,
  getSampleBlueprintCatalog,
  installSampleBlueprintCatalog,
  parseBlueprintCatalogBundle,
  verifyBlueprintCatalogBundle,
  type BlueprintCatalogSnapshot,
} from "../../catalog/blueprint-catalog";

let catalogPromise: Promise<BlueprintCatalogSnapshot> | undefined;

export function bootstrapNodeBlueprintCatalog(): Promise<BlueprintCatalogSnapshot> {
  catalogPromise ??= (async () => {
    const bundle = parseBlueprintCatalogBundle(seedJson);
    await verifyBlueprintCatalogBundle(bundle);
    const snapshot = createBlueprintCatalogSnapshot(bundle);
    installSampleBlueprintCatalog(snapshot);
    return snapshot;
  })();
  return catalogPromise;
}

export async function getNodeBlueprintCatalog(): Promise<BlueprintCatalogSnapshot> {
  await bootstrapNodeBlueprintCatalog();
  return getSampleBlueprintCatalog();
}