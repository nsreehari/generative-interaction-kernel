import { describe, expect, it } from "vitest";
import { materializeBlueprint } from "@gik/blueprint";
import { evalSyncJsonata } from "@gik/evaluators";
import { unwrap } from "@gik/kernel";
import { seedState } from "@gik/react";

import {
  openSampleBlueprint,
  resolveSampleBlueprintSource,
} from "../catalog/blueprint-catalog";
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
    expect(services["portfolio-semantic-intelligence"]?.kind).toBe("foundry-agent");
    expect(Object.keys(services["portfolio-semantic-intelligence"]?.operations ?? {}))
      .toEqual(["generateReport"]);
    expect(Object.values(services["portfolio-semantic-intelligence"]?.operations ?? {})
      .map(({ operation }) => operation)).toEqual(["chat"]);
    expect(Object.keys(services).filter((serviceId) =>
      serviceId.startsWith("portfolio-intelligence-2")
      || serviceId.startsWith("portfolio-intelligence-3"))).toEqual([]);
  });

  it("lowers both semantic modes and providers through the same logical service contract", () => {
    for (const ai of ["foundry", "copilot"] as const) {
      for (const semantic of ["simple-markdown", "rich-components"] as const) {
        const terminal = materializeBlueprint({
          blueprint: resolveSampleBlueprintSource("portfolio-tracker-new"),
          externalContext: {
            ai,
            "intelligence-model": "semantic",
            "market-prices": "mock",
            semantic,
            view: "desktop",
          },
        }).payload.terminalBlueprint.payload;
        const source = terminal.cells?.["portfolio-intelligence"].sources?.[1];
        const service = terminal.services?.["portfolio-semantic-intelligence"];

        expect(source).toMatchObject({
          service: "portfolio-semantic-intelligence",
          operation: "generateReport",
        });
        expect(
          (service?.operations as Record<string, { contract?: string }> | undefined)?.generateReport?.contract,
        ).toBe("portfolio-semantic-intelligence/v1");
        expect(source?.input?.expr).toContain(`'presentationMode':'${semantic}'`);
        expect(service?.kind).toBe(`${ai}-agent`);
        expect((service?.config as Record<string, unknown>)?.agent)
          .toBe("Portfolio-Semantic-Intelligence-Agent");
        expect(Object.keys(terminal.services ?? {}).filter((serviceId) =>
          serviceId.startsWith("portfolio-intelligence-2")
          || serviceId.startsWith("portfolio-intelligence-3"))).toEqual([]);
      }
    }
  });

  it("passes the invocation-owned authoring brief through the shared service request", () => {
    const service = resolveSampleBlueprintSource("portfolio-tracker-new")
      .payload.services?.["portfolio-semantic-intelligence"];
    const expression = service?.operations.generateReport.request?.transform?.expr;
    expect(expression).toBeTruthy();

    for (const semantic of ["simple-markdown", "rich-components"] as const) {
      const acceptedCapabilities = semantic === "simple-markdown"
        ? ["primitive:markdown"]
        : [
            "semantic:narrative",
            "semantic:measure-set",
            "primitive:container",
            "primitive:chart",
            "fluent:text",
            "fluent:list",
            "fluent:table",
          ];
      const authoringBrief = {
        objective: "Help the investor understand this portfolio snapshot.",
        sectionMap: { overview: "Orient the user quickly." },
        positiveCurrency: ["make material concentration immediately clear"],
        negativeCurrency: ["infer historical performance from a current snapshot"],
        constraints: ["one coherent experience"],
        blueprintProfile: {
          tiers: [
            { id: "report-semantic", kind: "semantic-report-model" },
            { id: "runtime-document", kind: "runtime-document" },
          ],
          behavior: "inert",
        },
      };
      const request = evalSyncJsonata(expression!, {
        input: {
          positions: {},
          summary: { marketValue: 1 },
          investorProfile: null,
          presentationMode: semantic,
          authoringBrief,
          acceptedCapabilities,
        },
      }) as Record<string, unknown>;
      const message = String(request.message);

      expect(request.maxOutputTokens).toBe(semantic === "rich-components" ? 8000 : 5000);
      expect(message).toContain(`"objective":"Help the investor understand this portfolio snapshot."`);
      expect(message).toContain(`"overview":"Orient the user quickly."`);
      expect(message.includes('"primitive:chart"')).toBe(semantic === "rich-components");
      expect(message.includes('"primitive:markdown"')).toBe(semantic === "simple-markdown");
      expect(message.includes("Emit payload.cells before payload.runtime"))
        .toBe(semantic === "rich-components");
      expect(request.instructions).toBeUndefined();
      // `acceptedCapabilities`/`authoringBrief` are deliberately echoed through onto the
      // transformed request (not just embedded in `message`'s prose) because the response
      // validator (service-host's validateResponse) binds `$request` to this exact object and
      // reads `$request.acceptedCapabilities`/`$request.authoringBrief` to police which
      // capabilities and section slots the generated Blueprint may use.
      expect(request.acceptedCapabilities).toEqual(acceptedCapabilities);
      expect(request.authoringBrief).toEqual(authoringBrief);
      expect(message).not.toContain(`"id":"generated-semantic-report"`);
      expect(message).not.toContain("SECTIONS != COMPONENTS");
      expect(message.length).toBeLessThan(2000);
    }
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