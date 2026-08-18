import { describe, expect, it } from "vitest";
import { unwrap } from "@gik/kernel";
import { seedState } from "@gik/react";

import { openSampleBlueprint } from "../catalog/blueprint-catalog";
import { createBlueprintServiceHost } from "../apps/browser-host/src/runtime/service-host";

const runtime = openSampleBlueprint("portfolio-tracker-new", {
  "intelligence-model": "simple",
  view: "desktop",
});
const typedManifest = runtime.vocabulary as Parameters<typeof seedState>[0];

describe("portfolio intelligence service declarations", () => {
  it("materializes the Blueprint-owned market data and intelligence services", () => {
    const services = unwrap(runtime.vocabulary).externals!.services!;

    expect(services["portfolio-market-data"]?.blueprint).toEqual({
      $ref: "blueprint:portfolio-tracker-mock@1.0.0",
    });
    expect(Object.values(services["portfolio-market-data"]?.operations ?? {})
      .map(({ operation }) => operation)).toEqual(["fetch-quotes"]);
    expect(services["portfolio-intelligence"]?.kind).toBe("foundry-agent");
    expect(Object.values(services["portfolio-intelligence"]?.operations ?? {})
      .map(({ operation }) => operation)).toEqual(["chat"]);
    expect(services["portfolio-intelligence-2"]?.kind).toBe("foundry-agent");
    expect(Object.values(services["portfolio-intelligence-2"]?.operations ?? {})
      .map(({ operation }) => operation)).toEqual(["chat"]);
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
    for (const serviceId of Object.keys(services)) {
      if (serviceId !== "portfolio-intelligence") delete services[serviceId];
    }

    const serviceHost = createBlueprintServiceHost(unavailable, seedState(typedManifest, runtime.state));
    await expect(serviceHost.describeServices()).rejects.toThrow("foundry-agent requires a valid endpoint");
  });
});