import type {
  DurableEffectFailureHandler,
  DurableEffectHandler,
  DurableProvider,
  DurableTransitionAdapter,
} from "../contracts";
import { createAzureFunctionConnector } from "../connectors/azure-function";
import { createBrowserIndexedDbConnector } from "../connectors/browser-indexed-db";
import { createFilesystemMcpConnector, type McpCallTool } from "../connectors/filesystem-mcp";
import { createDurableRuntime } from "./browser-runtime";

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
  runtimeId: string;
  config: DurableRuntimeConfig;
  transitionAdapter: DurableTransitionAdapter;
  effectHandlers?: Record<string, DurableEffectHandler>;
  effectFailureHandler?: DurableEffectFailureHandler;
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
  return createDurableRuntime({
    runtimeId: options.runtimeId,
    providers,
    transitionAdapter: options.transitionAdapter,
    effectHandlers: options.effectHandlers,
    effectFailureHandler: options.effectFailureHandler,
  });
}
