import {
  createBrowserIndexedDbConnector,
  type IndexedDbStorageOptions,
} from "@gik-ai/durable-runtime/connectors/browser-indexed-db";
import { createBlueprintExecution, type BlueprintExecution, type BlueprintExecutionOptions } from "../worker";

export function createIndexedDbBlueprintExecution(
  options: BlueprintExecutionOptions & { connector?: IndexedDbStorageOptions },
): BlueprintExecution {
  return createBlueprintExecution(
    options,
    "indexed-db",
    createBrowserIndexedDbConnector(options.connector),
  );
}