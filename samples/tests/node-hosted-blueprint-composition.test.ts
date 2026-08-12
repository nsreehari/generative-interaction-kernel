import { describe, expect, it } from "vitest";
import { createNodeHost } from "../apps/node-host/service";

describe("Node hosted Blueprint composition", () => {
  it("mounts the analyzer selected by host launch configuration", async () => {
    const host = await createNodeHost({ profile: "incident-analysis-new-shell", port: 0 });
    try {
      expect([...host.hostedControlFaces().keys()]).toEqual(["presentation-roots/incident-analyzer"]);
    } finally {
      await host.stop();
    }
  });
});