import { describe, expect, it } from "vitest";
import { unwrap } from "@gik/kernel";
import { seedState } from "@gik/react";

import { openSampleBlueprint } from "../catalog/blueprint-catalog";
import { createBlueprintServiceHost } from "../apps/browser-host/src/runtime/service-host";
import { resolveSampleNativeServices } from "../apps/browser-host/src/runtime/native-services";

const runtime = openSampleBlueprint("portfolio-tracker-new", {
  "intelligence-model": "simple",
  view: "desktop",
});
const typedManifest = runtime.vocabulary as Parameters<typeof seedState>[0];
const nativeServices = resolveSampleNativeServices("portfolio-tracker-new");

describe("portfolio intelligence service declarations", () => {
  it("materializes the Blueprint-owned market data and intelligence services", async () => {
    const serviceHost = createBlueprintServiceHost(runtime, seedState(typedManifest, runtime.state), nativeServices);
    const description = await serviceHost.describeServices();

    expect(description).toHaveLength(3);
    expect(description[0]?.provider.id).toBe("deterministic-agent:portfolio-market-data-mock");
    expect(description[0]?.capabilities.map(({ operation }) => operation)).toEqual(["fetch-quotes"]);
    expect(description.slice(1).map(({ provider }) => provider.id)).toEqual([
      "foundry-agent:portfolio-intelligence",
      "foundry-agent:portfolio-intelligence-2",
    ]);
    expect(description[1]?.capabilities.map(({ operation }) => operation)).toEqual(["chat"]);
    expect(description[2]?.capabilities.map(({ operation }) => operation)).toEqual(["chat"]);
  });

  it("rejects a Foundry declaration whose endpoint is invalid", async () => {
    const unavailable = structuredClone(runtime);
    const services = unwrap(unavailable.vocabulary).externals!.services!;
    services["portfolio-intelligence"] = {
      ...services["portfolio-intelligence"],
      config: {
        endpoint: "not-a-url",
        agent: "Portfolio-Intelligence-Agent",
        credentialRef: "foundry-agent/access-key",
      },
    };

    const serviceHost = createBlueprintServiceHost(unavailable, seedState(typedManifest, runtime.state), nativeServices);
    await expect(serviceHost.describeServices()).rejects.toThrow("foundry-agent requires a valid endpoint");
  });
});