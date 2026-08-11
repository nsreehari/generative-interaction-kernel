import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";
import seedJson from "../catalog/bootstrap/sample-blueprints.bundle.json" with { type: "json" };
import {
  bootstrapSampleBlueprintCatalog,
  createIndexedDbBlueprintCatalogStore,
  legacyLocalBlueprintStorageKey,
  parseBlueprintCatalogBundle,
  verifyBlueprintCatalogBundle,
} from "../catalog/blueprint-catalog";

describe("sample Blueprint catalog", () => {
  it("verifies and round-trips the generated seed through IndexedDB", async () => {
    const bundle = parseBlueprintCatalogBundle(seedJson);
    await verifyBlueprintCatalogBundle(bundle);
    const store = createIndexedDbBlueprintCatalogStore({ databaseName: `gik-catalog-${crypto.randomUUID()}` });

    const admitted = await store.admitSeed(bundle);
    const loaded = await store.loadSeed(bundle.bundleId);

    expect(loaded).toEqual(admitted);
    expect(loaded?.blueprints).toEqual(bundle.blueprints);
    expect(loaded?.blueprints).toHaveLength(Object.keys(bundle.entries).length);
    expect(loaded?.launchProfiles).toEqual(bundle.launchProfiles);
    expect(loaded?.launchProfiles.every((profile) => profile.requiredCapabilities === undefined)).toBe(true);
    expect(loaded?.entries["incident-report-analysis-shell"].payload.id).toBe("incident-report-analysis-shell");
    expect(loaded?.demoScenarios["portfolio-tracker-2tiers"]).toEqual(bundle.demoScenarios["portfolio-tracker-2tiers"]);
    await store.close();
  });

  it("rejects modified seed data before admission", async () => {
    const bundle = parseBlueprintCatalogBundle(structuredClone(seedJson));
    bundle.entries["samples-overview"].payload.version = "tampered";

    await expect(verifyBlueprintCatalogBundle(bundle)).rejects.toThrow(/digest is invalid/);
  });

  it("migrates legacy localStorage artifacts into user catalog records", async () => {
    const databaseName = `gik-catalog-${crypto.randomUUID()}`;
    const localArtifact = structuredClone(seedJson.entries["samples-overview"]);
    localArtifact.payload.id = "local-overview";
    const values = new Map([[legacyLocalBlueprintStorageKey, JSON.stringify({ "local-overview": localArtifact })]]);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
      },
    });

    const snapshot = await bootstrapSampleBlueprintCatalog({
      databaseName,
      seedUrl: "https://example.test/sample-blueprints.bundle.json",
      fetch: async () => new Response(JSON.stringify(seedJson), { status: 200 }),
    });
    const store = createIndexedDbBlueprintCatalogStore({ databaseName });

    expect(snapshot.entries["local-overview"].payload.id).toBe("local-overview");
    expect(snapshot.seedEntries).not.toHaveProperty("local-overview");
    expect((await store.readUserArtifacts()).blueprints).toHaveProperty("local-overview");
    expect(values.has(legacyLocalBlueprintStorageKey)).toBe(false);
    await store.close();
  });
});