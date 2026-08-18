import type { StorageApi } from "@gik/durable-runtime";
import type { Json } from "@gik/kernel";

import type { DurableStorageConnection } from "../service-kinds";

const BOOTSTRAP_MARKER_KEY = "$gik.bootstrap-assets";

export interface BlueprintBootstrapAssets {
  format: "gik-blueprint-bootstrap-assets/1";
  legacyStorageNamespaces?: string[];
  records: Array<{ key: string; value: Json }>;
}

export function bootstrapAssetValue<T>(
  assets: BlueprintBootstrapAssets,
  key: string,
): T | undefined {
  return assets.records.find((record) => record.key === key)?.value as T | undefined;
}

export function bootstrapAssetValues<T>(
  assets: BlueprintBootstrapAssets,
  prefix: string,
): T[] {
  return assets.records
    .filter((record) => record.key.startsWith(prefix))
    .map((record) => record.value as T);
}

export function createBootstrapStorageConnection(
  api: StorageApi,
  ref: string,
  assets?: BlueprintBootstrapAssets,
  legacyRefs: readonly string[] = [],
): DurableStorageConnection {
  let initialized: Promise<void> | undefined;
  const initialize = () => initialized ??= initializeBootstrapAssets(api, ref, assets, legacyRefs);
  return {
    ref,
    api: {
      async dispatch(request) {
        await initialize();
        return api.dispatch(request);
      },
    },
  };
}

async function initializeBootstrapAssets(
  api: StorageApi,
  ref: string,
  assets?: BlueprintBootstrapAssets,
  legacyRefs: readonly string[] = [],
): Promise<void> {
  if (!assets) return;
  const marker = await api.dispatch({
    ref,
    capability: "kv",
    operation: "read",
    args: [BOOTSTRAP_MARKER_KEY],
  });
  if (marker !== null && marker !== undefined) return;

  for (const legacyRef of legacyRefs) {
    const keys = await api.dispatch({
      ref: legacyRef,
      capability: "kv",
      operation: "listKeys",
    });
    if (!Array.isArray(keys)) {
      throw new Error(`Legacy Blueprint storage '${legacyRef}' returned an invalid key list`);
    }
    for (const key of keys.map(String)) {
      if (key === BOOTSTRAP_MARKER_KEY || await hasValue(api, ref, key)) continue;
      const value = await api.dispatch({
        ref: legacyRef,
        capability: "kv",
        operation: "read",
        args: [key],
      });
      await api.dispatch({
        ref,
        capability: "kv",
        operation: "write",
        args: [key, value],
      });
    }
  }

  for (const record of assets.records) {
    if (record.key === BOOTSTRAP_MARKER_KEY) {
      throw new Error(`Blueprint bootstrap asset key '${BOOTSTRAP_MARKER_KEY}' is reserved`);
    }
    if (!await hasValue(api, ref, record.key)) {
      await api.dispatch({
        ref,
        capability: "kv",
        operation: "write",
        args: [record.key, record.value],
      });
    }
  }
  await api.dispatch({
    ref,
    capability: "kv",
    operation: "write",
    args: [BOOTSTRAP_MARKER_KEY, { format: assets.format }],
  });
}

async function hasValue(api: StorageApi, ref: string, key: string): Promise<boolean> {
  const value = await api.dispatch({
    ref,
    capability: "kv",
    operation: "read",
    args: [key],
  });
  return value !== null && value !== undefined;
}
