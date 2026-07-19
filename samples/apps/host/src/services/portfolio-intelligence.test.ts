import { describe, expect, it } from "vitest";
import type { ServiceDeclaration } from "@gik/kernel";
import { seedState } from "@gik/react";

import manifest from "../../../../bundles/portfolio-tracker/manifest.json" with { type: "json" };
import state from "../../../../bundles/portfolio-tracker/state.json" with { type: "json" };
import {
  createPortfolioQueueFace,
  DETERMINISTIC_PORTFOLIO_PROVIDER,
} from "../../../../bundles/portfolio-tracker/services";

const declarations = manifest.payload.externals.services as Record<string, ServiceDeclaration>;
const typedManifest = manifest as unknown as Parameters<typeof seedState>[0];

describe("portfolio intelligence service declarations", () => {
  it("materializes the Blueprint-owned deterministic service kind", async () => {
    const queueFace = createPortfolioQueueFace(seedState(typedManifest, structuredClone(state)), declarations);
    const description = await queueFace.describeServices();

    expect(description.providers).toHaveLength(1);
    expect(description.providers[0]?.provider.id).toBe(`deterministic-agent:${DETERMINISTIC_PORTFOLIO_PROVIDER}`);
    expect(description.bindings.map(({ service, operation }) => `${service}.${operation}`)).toEqual([
      "portfolio-intelligence.analyze",
      "portfolio-intelligence.propose-strategies",
    ]);
  });

  it("rejects a declaration whose configured deterministic handler is unavailable", () => {
    const unavailable = structuredClone(declarations);
    unavailable["portfolio-intelligence"] = {
      ...unavailable["portfolio-intelligence"],
      config: { handler: "not-registered" },
    };

    expect(() => createPortfolioQueueFace(seedState(typedManifest, structuredClone(state)), unavailable))
      .toThrow("Unknown deterministic handler 'not-registered'");
  });
});
