import {
  createAzureFunctionConnector,
  type AzureFunctionConnectorOptions,
} from "@gik/durable-runtime/connectors/azure-function";
import { createBlueprintExecution, type BlueprintExecution, type BlueprintExecutionOptions } from "../worker";

export function createAzureBlueprintExecution(
  options: BlueprintExecutionOptions & { connector: AzureFunctionConnectorOptions },
): BlueprintExecution {
  return createBlueprintExecution(
    options,
    "stores-proxy",
    createAzureFunctionConnector(options.connector),
  );
}