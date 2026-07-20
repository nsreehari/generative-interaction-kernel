import assert from "node:assert/strict";
import { test } from "vitest";
import {
  loadProfile,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
  runProfile,
  type LayerRecipe,
  type ProfileArtifact,
  type RecipeArtifactBase,
} from "@gik/profile";

export interface SampleProfileRunExpectation {
  rootCapability: string;
  minChildren?: number;
}

export interface SampleProfileRunCase {
  name: string;
  seed: Record<string, unknown>;
  ctx: Record<string, unknown>;
  expect: SampleProfileRunExpectation;
}

export interface SampleProfileTestSpec {
  name: string;
  profileFile: string;
  recipeFiles: readonly string[];
  expectLoad: {
    id: string;
    kind: string;
    stages: readonly string[];
  };
  runs: readonly SampleProfileRunCase[];
}

type JsonModule = { default: unknown };

const jsonModules = import.meta.glob("../profiles/**/*.json", { eager: true }) as Record<string, JsonModule>;

function joinSamplePath(baseDir: string, file: string): string {
  return `${baseDir}/${file}`;
}

function requiredJson(path: string): unknown {
  const mod = jsonModules[path];
  if (!mod) {
    throw new Error(`Missing sample test asset '${path}'`);
  }
  return mod.default;
}

export function registerSampleProfileTests(baseDir: string, spec: SampleProfileTestSpec): void {
  const profileArtifact = requiredJson(joinSamplePath(baseDir, spec.profileFile)) as ProfileArtifact;
  const recipeArtifacts = spec.recipeFiles.map((file) => requiredJson(joinSamplePath(baseDir, file))) as RecipeArtifactBase<LayerRecipe>[];
  const profile = loadProfile<LayerRecipe>(
    profileArtifact,
    recipeArtifacts,
    resolveProfileTemplateResource,
    resolveProfileTemplate
  );

  test(`${spec.name}: resolves the authored layer chain`, () => {
    assert.equal(profile.artifact.payload.id, spec.expectLoad.id);
    assert.equal(profile.artifact.payload.kind, spec.expectLoad.kind);
    assert.deepEqual(
      profile.stages.map((stage) => `${stage.fromLayer.kind}->${stage.toLayer.kind}`),
      spec.expectLoad.stages
    );
  });

  for (const runCase of spec.runs) {
    test(`${spec.name}: ${runCase.name}`, () => {
      const doc = runProfile(profile, runCase.seed, runCase.ctx) as {
        root: { capability: string; edges?: { children?: unknown[] } };
      };

      assert.equal(doc.root.capability, runCase.expect.rootCapability);
      if (runCase.expect.minChildren !== undefined) {
        assert.ok(
          (doc.root.edges?.children?.length ?? 0) >= runCase.expect.minChildren,
          `expected at least ${runCase.expect.minChildren} runtime children`
        );
      }
    });
  }
}