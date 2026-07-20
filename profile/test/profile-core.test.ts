import { describe, expect, it } from "vitest";

import { resolveProfile, type ProfileArtifact } from "../src/profile-core";

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
});