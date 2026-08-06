import { describe, expect, it } from "vitest";
import { validateBlueprintArtifact, type BlueprintArtifact } from "@gik/blueprint";

import {
  hasSampleBlueprint,
  getSampleBlueprintCatalog,
  openSampleBlueprint,
  resolveSampleBlueprintSource,
} from "../shared/blueprints";

type FixtureExpectation = {
  namespace: string;
  root: string;
  stages: string[];
};

const fixtures: Record<string, FixtureExpectation> = {
  "4layers": {
    namespace: "architecture",
    root: "four-layers-root",
    stages: ["workflow", "interaction", "presentation", "runtime-document"],
  },
  briefing: {
    namespace: "briefing",
    root: "briefing-root",
    stages: ["agent-interaction", "runtime-document"],
  },
  "live-cards": {
    namespace: "liveCards",
    root: "live-cards-root",
    stages: ["interaction", "presentation", "runtime-document"],
  },
};

describe("reauthored canonical Blueprint fixtures", () => {
  for (const [id, expected] of Object.entries(fixtures)) {
    it(`${id} is a canonical direct-runtime Blueprint`, () => {
      expect(hasSampleBlueprint(id)).toBe(true);
      const artifact: BlueprintArtifact = resolveSampleBlueprintSource(id);

      expect(() => validateBlueprintArtifact(artifact)).not.toThrow();
      expect(artifact.payload.kind).toBe("runtime-blueprint");
      expect(artifact.payload.tiers.map(({ id, kind }) => [id, kind])).toEqual([
        ["runtime-document", "runtime-document"],
      ]);
      expect(artifact.payload.recipes).toEqual([]);
      expect(artifact.payload.metadata).toMatchObject({
        executionModel: "direct-runtime",
        authoredStages: expected.stages,
      });
      expect(artifact.payload).not.toHaveProperty("authoring");
      expect(artifact.payload).not.toHaveProperty("blueprint-template");
      expect(artifact.payload).not.toHaveProperty("organism");
      expect(JSON.stringify(artifact)).not.toContain('"executor"');
      expect(getSampleBlueprintCatalog().blueprints).not.toContain(id);
    });

    it(`${id} opens as a Kernel-executable program`, () => {
      const runtime = openSampleBlueprint(id);

      expect(runtime.blueprintId).toBe(id);
      expect(runtime.program.payload.root.id).toBe(expected.root);
      expect(runtime.vocabulary.payload.namespaces).toContain(expected.namespace);
      expect(runtime.state).toHaveProperty(expected.namespace);
    });
  }
});