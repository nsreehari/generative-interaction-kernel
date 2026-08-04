import {
  createFilesystemMcpConnector,
  type FilesystemMcpConnectorOptions,
  type McpCallTool,
} from "@gik/durable-runtime/connectors/filesystem-mcp";
import { createBlueprintExecution, type BlueprintExecution, type BlueprintExecutionOptions } from "../worker";

export function createFilesystemMcpBlueprintExecution(
  options: BlueprintExecutionOptions & {
    callTool: McpCallTool;
    connector?: FilesystemMcpConnectorOptions;
  },
): BlueprintExecution {
  return createBlueprintExecution(
    options,
    "fs-path",
    createFilesystemMcpConnector(options.callTool, options.connector),
  );
}