import type { DeterministicServiceHandler, DurableStorageConnection } from "../../service-kinds";
import {
  createMemoryStorageApi,
  createMemoryStorageRef,
} from "@gik/durable-runtime/storage/memory";
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

const incidentAnalyzerServices: SampleNativeServices = {
  durableStorageConnections: {
    "incident-assets-store": createSeededStorageConnection(
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
};

export function resolveSampleNativeServices(id: string): SampleNativeServices | undefined {
  const nativeId = getSampleBlueprintCatalog().nativeFrom[id] ?? id;
  return modules[id] ?? modules[nativeId];
}
