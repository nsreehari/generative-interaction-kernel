import { createInMemoryProvider } from "@gik/durable-runtime/connectors/in-memory";
import { createBlueprintExecution, type BlueprintExecution, type BlueprintExecutionOptions } from "../worker";

export function createInMemoryBlueprintExecution(
  options: BlueprintExecutionOptions,
): BlueprintExecution {
  return createBlueprintExecution(options, "memory", createInMemoryProvider());
}