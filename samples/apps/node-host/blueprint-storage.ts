import {
  createMemoryStorageApi,
  createMemoryStorageRef,
} from "@gik/durable-runtime/storage/memory";

import {
  createBlueprintStorageConnectionFactory,
  type BlueprintStorageConnectionFactory,
} from "../shared/blueprint-storage";

export function createNodeBlueprintStorageConnectionFactory(): BlueprintStorageConnectionFactory {
  return createBlueprintStorageConnectionFactory(
    createMemoryStorageApi(),
    createMemoryStorageRef,
  );
}
