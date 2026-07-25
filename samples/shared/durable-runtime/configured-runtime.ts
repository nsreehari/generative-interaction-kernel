import type { DurableEffectHandler, DurableKernel } from "./contracts";
import { createBrowserDurableRuntime } from "./browser-runtime";
import { createAzureFunctionsProvider } from "./providers/azure-functions";
import { createFilesystemMcpProvider, type McpCallTool } from "./providers/filesystem-mcp";
import { createIndexedDbProvider } from "./providers/indexed-db";

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
  kernels: DurableKernel[];
  effectHandlers?: Record<string, DurableEffectHandler>;
}) {
  const providers: Record<string, ReturnType<typeof createIndexedDbProvider>> = {};
  if (options.config.indexedDb) {
    providers["indexed-db"] = createIndexedDbProvider(options.config.indexedDb);
  }
  if (options.config.filesystem) {
    const callTool = await options.config.filesystem.connect(options.config.filesystem.mcpUrl);
    providers["fs-path"] = createFilesystemMcpProvider(callTool);
  }
  if (options.config.azure) {
    providers["stores-proxy"] = createAzureFunctionsProvider(options.config.azure);
  }
  return createBrowserDurableRuntime({
    providers,
    kernels: options.kernels,
    effectHandlers: options.effectHandlers,
  });
}