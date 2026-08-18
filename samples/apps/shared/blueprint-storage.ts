import type { StorageApi } from "@gik/durable-runtime";

import {
  createBootstrapStorageConnection,
} from "../../catalog/blueprint-bootstrap-assets";
import { resolveSampleBlueprintBootstrapAssets } from "../../catalog/blueprint-catalog";
import type {
  DurableStorageConnection,
  SampleServiceRegistryOptions,
} from "../../service-kinds";

export const BLUEPRINT_STATE_CONNECTION = "blueprint-state";

export interface BlueprintStorageIdentity {
  blueprintId: string;
  instanceId: string;
}

export type BlueprintStorageConnectionFactory = (
  identity: BlueprintStorageIdentity,
) => DurableStorageConnection;

export function createBlueprintStorageConnectionFactory(
  api: StorageApi,
  createRef: (namespace: string) => string,
): BlueprintStorageConnectionFactory {
  const connections = new Map<string, DurableStorageConnection>();
  return ({ blueprintId, instanceId }) => {
    const key = JSON.stringify({ blueprintId, instanceId });
    let connection = connections.get(key);
    if (!connection) {
      const namespace = `samples:blueprint-state:${encodeURIComponent(key)}`;
      const assets = resolveSampleBlueprintBootstrapAssets(blueprintId);
      connection = createBootstrapStorageConnection(
        api,
        createRef(namespace),
        assets,
        assets?.legacyStorageNamespaces?.map(createRef),
      );
      connections.set(key, connection);
    }
    return connection;
  };
}

export function bindBlueprintStorage(
  options: SampleServiceRegistryOptions,
  factory: BlueprintStorageConnectionFactory,
  identity: BlueprintStorageIdentity,
): SampleServiceRegistryOptions {
  return {
    ...options,
    durableStorageConnections: {
      [BLUEPRINT_STATE_CONNECTION]: factory(identity),
      ...options.durableStorageConnections,
    },
  };
}
