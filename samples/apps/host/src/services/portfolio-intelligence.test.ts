import { describe, expect, it } from "vitest";
import { unwrap } from "@gik/kernel";
import { seedState } from "@gik/react";

import { openSampleBlueprint } from "../../../../shared/blueprints";
import {
  createBlueprintServiceHost,
} from "../../../../shared/service-runtime";
import { DETERMINISTIC_PORTFOLIO_PROVIDER } from "../../../../services";

const runtime = openSampleBlueprint("portfolio-tracker");
const typedManifest = runtime.manifest as Parameters<typeof seedState>[0];

describe("portfolio intelligence service declarations", () => {
  it("materializes the Blueprint-owned deterministic service kind", async () => {
    const serviceHost = createBlueprintServiceHost(runtime, seedState(typedManifest, runtime.state));
    const description = await serviceHost.describeServices();

    expect(description).toHaveLength(1);
    expect(description[0]?.provider.id).toBe(`deterministic-agent:${DETERMINISTIC_PORTFOLIO_PROVIDER}`);
    expect(description[0]?.capabilities.map(({ operation }) => operation)).toEqual(["analyze", "propose-strategies"]);
  });

  it("rejects a declaration whose configured deterministic handler is unavailable", async () => {
    const unavailable = structuredClone(runtime);
    const services = unwrap(unavailable.manifest).externals!.services!;
    services["portfolio-intelligence"] = {
      ...services["portfolio-intelligence"],
      config: { handler: "not-registered" },
    };

    const serviceHost = createBlueprintServiceHost(unavailable, seedState(typedManifest, runtime.state));
    await expect(serviceHost.describeServices()).rejects.toThrow("Unknown deterministic handler 'not-registered'");
  });
});
