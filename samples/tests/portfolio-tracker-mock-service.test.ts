import { DefaultServiceHost, ServiceKindRegistry } from "@gik/controlface";
import { createSampleCatalogBlueprintRegistry } from "../catalog/blueprint-catalog";
import { createBlueprintServiceResolver } from "../apps/shared/blueprint-service-resolver";
import {
  InMemoryStateModel,
  JsonataExpressionProvider,
  type Json,
  type ServiceDeclaration,
} from "@gik/kernel";
import { describe, expect, it } from "vitest";

const operations = ["fetch-quotes", "analyze"] as const;

function createHost(): DefaultServiceHost {
  const declarations: Record<string, ServiceDeclaration> = {
    portfolioMock: {
      blueprint: { $ref: "blueprint:portfolio-tracker-mock@1.0.0" },
      version: "1",
      operations: Object.fromEntries(operations.map((operation) => [operation, {
        operation,
        contract: `portfolio-mock-${operation}/v1`,
        settlement: {
          transform: {
            kind: "jsonata",
            expr: "{'outcome':'completed','detail':{'response':response}}",
          },
        },
      }])),
    },
  };
  return new DefaultServiceHost({
    blueprintId: "portfolio-mock-consumer",
    blueprintRevision: "1",
    declarations,
    registry: new ServiceKindRegistry(),
    blueprintServices: createBlueprintServiceResolver({
      registry: createSampleCatalogBlueprintRegistry(),
      createNativeRegistry: () => new ServiceKindRegistry(),
    }),
    state: new InMemoryStateModel([]),
    expression: new JsonataExpressionProvider({ safe: true }),
  });
}

async function invoke(
  host: DefaultServiceHost,
  operation: typeof operations[number],
  data: Record<string, Json>,
): Promise<Json | undefined> {
  const result = await host.invoke({
    kind: "invoke",
    node: "consumer",
    control: { tool: operation },
    data,
  });
  return result?.detail?.response;
}

describe("portfolio tracker mock Blueprint service", () => {
  it("generates stable prices for arbitrary ticker symbols", async () => {
    const host = createHost();
    const holdings = {
      AAPL: { ticker: "AAPL", quantity: 2, costBasis: 90 },
      "X9-Z": { ticker: "X9-Z", quantity: 1, costBasis: 10 },
    };

    const first = await invoke(host, "fetch-quotes", { holdings });
    const second = await invoke(host, "fetch-quotes", { holdings });

    expect(first).toEqual(second);
    expect(first).toEqual({
      quotes: {
        AAPL: { ticker: "AAPL", price: 212.93 },
        "X9-Z": {
          ticker: "X9-Z",
          price: expect.any(Number),
        },
      },
      provider: "portfolio-market-data-mock",
    });
  });

  it("produces deterministic mock intelligence from supplied values", async () => {
    const response = await invoke(createHost(), "analyze", {
      positions: {
        AAPL: { ticker: "AAPL", value: 425.86 },
        MSFT: { ticker: "MSFT", value: 1073.43 },
      },
      summary: {
        marketValue: 1499.29,
        gainLoss: 779.29,
      },
    });

    expect(response).toEqual({
      markdown: "# Mock portfolio intelligence\n\nLargest position: MSFT\n\n- Market value: 1499.29\n- Gain/loss: 779.29\n\n> Deterministic mock response for the current snapshot; not model-generated.",
      provider: "portfolio-intelligence-mock",
    });
  });
});
