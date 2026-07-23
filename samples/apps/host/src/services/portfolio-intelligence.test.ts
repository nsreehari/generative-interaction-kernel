import { describe, expect, it } from "vitest";
import { unwrap } from "@gik/kernel";
import { seedState } from "@gik/react";

import { openSampleBlueprint } from "../../../../shared/blueprints";
import {
  createBlueprintServiceHost,
} from "../../../../shared/service-runtime";

const runtime = openSampleBlueprint("portfolio-tracker");
const typedManifest = runtime.manifest as Parameters<typeof seedState>[0];

describe("portfolio intelligence service declarations", () => {
  it("materializes the Blueprint-owned market data and intelligence services", async () => {
    const serviceHost = createBlueprintServiceHost(runtime, seedState(typedManifest, runtime.state));
    const description = await serviceHost.describeServices();

    expect(description).toHaveLength(4);
    expect(description[0]?.provider.id).toBe("http-service:portfolio-market-data");
    expect(description[0]?.capabilities.map(({ operation }) => operation)).toEqual(["check-access", "fetch-quotes"]);
    expect(description[1]?.provider.id).toBe("foundry-agent:portfolio-intelligence");
    expect(description[1]?.capabilities.map(({ operation }) => operation)).toEqual(["check-access", "chat"]);
    expect(description[2]?.provider.id).toBe("foundry-agent:portfolio-intelligence-2");
    expect(description[2]?.capabilities.map(({ operation }) => operation)).toEqual(["chat"]);
    expect(description[3]?.provider.id).toBe("foundry-agent:portfolio-strategies");
    expect(description[3]?.capabilities.map(({ operation }) => operation)).toEqual(["chat"]);
  });

  it("rejects a Foundry declaration whose endpoint is invalid", async () => {
    const unavailable = structuredClone(runtime);
    const services = unwrap(unavailable.manifest).externals!.services!;
    const config = services["portfolio-intelligence"].config;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("portfolio-intelligence config must be an object");
    }
    services["portfolio-intelligence"] = {
      ...services["portfolio-intelligence"],
      config: {
        ...config,
        endpoint: "not-a-url",
      },
    };

    const serviceHost = createBlueprintServiceHost(unavailable, seedState(typedManifest, runtime.state));
    await expect(serviceHost.describeServices()).rejects.toThrow("foundry-agent requires a valid endpoint");
  });
});
