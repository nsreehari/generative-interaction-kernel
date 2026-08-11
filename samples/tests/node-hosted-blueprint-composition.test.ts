import { describe, expect, it } from "vitest";
import { createNodeHost } from "../apps/node-host/service";

describe("Node hosted Blueprint composition", () => {
  it("recursively mounts the three analyzers in the semantic incident shell", async () => {
    const host = await createNodeHost({ profile: "incident-analysis-new-shell", port: 0 });
    try {
      expect([...host.hostedControlFaces().keys()]).toEqual([
        "incident-workspace/analyzer-organisms/refinement-analyzer",
        "incident-workspace/analyzer-organisms/operational-analyzer",
        "incident-workspace/analyzer-organisms/source-faithful-analyzer",
      ]);
    } finally {
      await host.stop();
    }
  });
});