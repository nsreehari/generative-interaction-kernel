import { describe, expect, it } from "vitest";
import { unwrap } from "@gik/kernel";
import { seedState } from "@gik/react";

import { openSampleBlueprint } from "../../../../shared/blueprints";
import {
  createBlueprintQueueFace,
} from "../../../../shared/service-runtime";
import { DETERMINISTIC_PORTFOLIO_PROVIDER } from "../../../../services";

const runtime = openSampleBlueprint("portfolio-tracker");
const typedManifest = runtime.manifest as Parameters<typeof seedState>[0];

describe("portfolio intelligence service declarations", () => {
  it("materializes the Blueprint-owned deterministic service kind", async () => {
    const queueFace = createBlueprintQueueFace(runtime, seedState(typedManifest, runtime.state));
    const description = await queueFace.describeServices();

    expect(description.providers).toHaveLength(1);
    expect(description.providers[0]?.provider.id).toBe(`deterministic-agent:${DETERMINISTIC_PORTFOLIO_PROVIDER}`);
    expect(description.bindings.map(({ service, operation }) => `${service}.${operation}`)).toEqual([
      "portfolio-intelligence.analyze",
      "portfolio-intelligence.propose-strategies",
    ]);
  });

  it("rejects a declaration whose configured deterministic handler is unavailable", () => {
    const unavailable = structuredClone(runtime);
    const services = unwrap(unavailable.manifest).externals!.services!;
    services["portfolio-intelligence"] = {
      ...services["portfolio-intelligence"],
      config: { handler: "not-registered" },
    };

    expect(() => createBlueprintQueueFace(unavailable, seedState(typedManifest, runtime.state)))
      .toThrow("Unknown deterministic handler 'not-registered'");
  });
});
