import { describe, expect, it } from "vitest";

import {
  resolveProfile,
  traceStages,
  type ProfileArtifact,
  type RecipeArtifactBase,
} from "../src/profile-core";
import { validateLoweringRecipeArtifact, validateProfileArtifact } from "../src/schema";
import {
  lowerToProgram,
  type HeadlessProgramDefinition,
} from "../../kernel/src/index";

describe("resolveProfile", () => {
  it("resolves a one-layer terminal Profile without a lowering recipe", () => {
    const artifact: ProfileArtifact = {
      gik: "0.1",
      type: "profile",
      payload: {
        id: "terminal-app",
        kind: "runtime-blueprint",
        version: "1.0.0",
        layers: [{ id: "runtime-document", kind: "runtime-document" }],
        recipes: [],
        resources: { document: { inline: { root: { id: "root", capability: "ui:text" } } } },
      },
    };

    const resolved = resolveProfile(artifact, []);

    expect(resolved.stages).toEqual([]);
    expect(resolved.resources.document).toEqual({ root: { id: "root", capability: "ui:text" } });
  });

  it("rejects multiple disconnected layers when no lowering recipe is declared", () => {
    const artifact: ProfileArtifact = {
      gik: "0.1",
      type: "profile",
      payload: {
        id: "invalid-terminal-app",
        kind: "runtime-blueprint",
        version: "1.0.0",
        layers: [
          { id: "source", kind: "source" },
          { id: "runtime-document", kind: "runtime-document" },
        ],
        recipes: [],
      },
    };

    expect(() => resolveProfile(artifact, [])).toThrow(
      "with no recipes must have exactly one terminal layer"
    );
  });

  it("lowers backend service tiers to a validated headless executable program", () => {
    const artifact: ProfileArtifact = {
      gik: "0.1",
      type: "profile",
      payload: {
        id: "order-service",
        kind: "service-blueprint",
        version: "1.0.0",
        layers: [
          { id: "intent", kind: "service-intent" },
          { id: "runtime", kind: "runtime-program" },
        ],
        recipes: [{ id: "service-to-runtime", from: "intent", to: "runtime" }],
      },
    };
    const recipe: RecipeArtifactBase = {
      gik: "0.1",
      type: "lowering-recipe",
      payload: {
        id: "service-to-runtime",
        from: "service-intent",
        to: "runtime-program",
        metadata: { executor: "service-intent->runtime-program" },
      },
    };

    validateProfileArtifact(artifact);
    validateLoweringRecipeArtifact(recipe);
    const profile = resolveProfile(artifact, [recipe]);
    const lowering = (intent: { requestToken: string }): HeadlessProgramDefinition => {
      const trace = traceStages(profile, intent, {}, {
        "service-intent->runtime-program": (_recipe, input) => ({
          graph: {
            inputs: [(input as typeof intent).requestToken],
            outputs: ["response"],
            nodes: [{
              id: "handle-request",
              inputs: { request: (input as typeof intent).requestToken },
              outputs: { response: "response" },
              operation: { kind: "compute", expression: "$inputs.request" },
            }],
          },
        } satisfies HeadlessProgramDefinition),
      });
      return trace.at(-1)?.output as HeadlessProgramDefinition;
    };

    const message = lowerToProgram(lowering, { requestToken: "request" });

    expect(profile.stages.map(({ fromLayer, toLayer }) => [fromLayer.kind, toLayer.kind])).toEqual([
      ["service-intent", "runtime-program"],
    ]);
    expect(message.payload.root).toBeUndefined();
    expect(message.payload.graph?.nodes[0].id).toBe("handle-request");
  });
});