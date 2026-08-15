import type { DeterministicServiceHandler, DurableStorageConnection } from "../../service-kinds";
import {
  createMemoryStorageApi,
  createMemoryStorageRef,
} from "@gik/durable-runtime/storage/memory";
import {
  MOCK_MARKET_DATA_PROVIDER,
  mockMarketDataHandler,
} from "../../blueprints/portfolio-tracker/native/services/mock-market-data";
import {
  DETERMINISTIC_PORTFOLIO_PROVIDER,
  MOCK_PORTFOLIO_INTELLIGENCE_PROVIDER,
  mockPortfolioIntelligenceHandler,
  portfolioIntelligenceHandler,
} from "../../blueprints/portfolio-tracker/native/services/portfolio-intelligence";
import { getSampleBlueprintCatalog } from "../../catalog/blueprint-catalog";
import {
  createSeededStorageConnection,
  type StorageSeedCatalog,
} from "../../catalog/storage-seed";
import incidentAssetSeed from "../../blueprints/incident-analysis-assets/seed-data/catalog.json" with { type: "json" };

export interface SampleNativeServices {
  deterministicHandlers?: Readonly<Record<string, DeterministicServiceHandler>>;
  durableStorageConnections?: Readonly<Record<string, DurableStorageConnection>>;
}

const portfolioServices: SampleNativeServices = {
  deterministicHandlers: {
    [DETERMINISTIC_PORTFOLIO_PROVIDER]: portfolioIntelligenceHandler,
    [MOCK_PORTFOLIO_INTELLIGENCE_PROVIDER]: mockPortfolioIntelligenceHandler,
    [MOCK_MARKET_DATA_PROVIDER]: mockMarketDataHandler,
  },
};

const incidentAnalyzerServices: SampleNativeServices = {
  durableStorageConnections: {
    "incident-runtime-cache": createSeededStorageConnection(
      createMemoryStorageApi(),
      createMemoryStorageRef(incidentAssetSeed.namespace),
      incidentAssetSeed as StorageSeedCatalog,
    ),
  },
};
const incidentShellServices: SampleNativeServices = {
  ...incidentAnalyzerServices,
};

const modules: Readonly<Record<string, SampleNativeServices>> = {
  "incident-analysis-new-shell": incidentShellServices,
  "incident-report-explorer-1a": incidentAnalyzerServices,
  "incident-report-explorer-2": incidentAnalyzerServices,
  "incident-report-explorer-3": incidentAnalyzerServices,
  "portfolio-tracker": portfolioServices,
  "portfolio-tracker-new": portfolioServices,
  "portfolio-tracker-2tiers-headless": portfolioServices,
};

export function resolveSampleNativeServices(id: string): SampleNativeServices | undefined {
  const nativeId = getSampleBlueprintCatalog().nativeFrom[id] ?? id;
  return modules[id] ?? modules[nativeId];
}
