import type { DurableEffectHandler, DurableKernel, DurableProvider } from "../contracts";
import { createAzureFunctionConnector } from "../connectors/azure-function";
import { createBrowserIndexedDbConnector } from "../connectors/browser-indexed-db";
import { createFilesystemMcpConnector, type McpCallTool } from "../connectors/filesystem-mcp";
import { createBrowserDurableRuntime } from "./browser-runtime";

export type DurableRuntimeConfig = {
  indexedDb?: { databaseName?: string; indexedDB?: IDBFactory };
  filesystem?: { mcpUrl: string; connect: (url: string) => Promise<McpCallTool> | McpCallTool };
  azure?: {
    baseUrl: string;
    getHeaders?: () => Record<string, string>;
    fetch?: typeof globalThis.fetch;
  };
};

export async function createConfiguredBrowserDurableRuntime(options: {
  config: DurableRuntimeConfig;
  kernel: DurableKernel;
  effectHandlers?: Record<string, DurableEffectHandler>;
}) {
  const providers: Record<string, DurableProvider> = {};
  if (options.config.indexedDb) {
    providers["indexed-db"] = createBrowserIndexedDbConnector(options.config.indexedDb);
  }
  if (options.config.filesystem) {
    const callTool = await options.config.filesystem.connect(options.config.filesystem.mcpUrl);
    providers["fs-path"] = createFilesystemMcpConnector(callTool);
  }
  if (options.config.azure) {
    providers["stores-proxy"] = createAzureFunctionConnector(options.config.azure);
  }
  return createBrowserDurableRuntime({
    providers,
    kernel: options.kernel,
    effectHandlers: options.effectHandlers,
  });
}
