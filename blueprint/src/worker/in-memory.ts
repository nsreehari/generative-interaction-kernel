import { createMemoryStorage } from "gik-durable-runtime/storage/memory";
import { createBlueprintExecution, type BlueprintExecution, type BlueprintExecutionOptions } from "../worker";

export function createInMemoryBlueprintExecution(
  options: BlueprintExecutionOptions,
): BlueprintExecution {
  return createBlueprintExecution(options, "memory", createMemoryStorage());
}