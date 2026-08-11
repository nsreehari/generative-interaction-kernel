import type { DeterministicServiceHandler } from "../apps/service-kinds/deterministic-agent";
import {
  MOCK_MARKET_DATA_PROVIDER,
  mockMarketDataHandler,
} from "../blueprints/portfolio-tracker/native/services/mock-market-data";
import {
  DETERMINISTIC_PORTFOLIO_PROVIDER,
  portfolioIntelligenceHandler,
} from "../blueprints/portfolio-tracker/native/services/portfolio-intelligence";
import { getSampleBlueprintCatalog } from "./blueprint-catalog";

export interface SampleNativeServices {
  deterministicHandlers?: Readonly<Record<string, DeterministicServiceHandler>>;
}

const portfolioServices: SampleNativeServices = {
  deterministicHandlers: {
    [DETERMINISTIC_PORTFOLIO_PROVIDER]: portfolioIntelligenceHandler,
    [MOCK_MARKET_DATA_PROVIDER]: mockMarketDataHandler,
  },
};

const modules: Readonly<Record<string, SampleNativeServices>> = {
  "portfolio-tracker": portfolioServices,
  "portfolio-tracker-2tiers-headless": portfolioServices,
};

export function resolveSampleNativeServices(id: string): SampleNativeServices | undefined {
  const nativeId = getSampleBlueprintCatalog().nativeFrom[id] ?? id;
  return modules[nativeId];
}