import { ServiceKindRegistry, type ServiceKindFactory } from "../../face/src/services/service-kinds";

import { copilotAgentKind } from "./copilot-agent";
import { createDeterministicAgentKind, type DeterministicServiceHandler } from "./deterministic-agent";
import { foundryAgentKind } from "./foundry-agent";
import {
  DETERMINISTIC_PORTFOLIO_PROVIDER,
  portfolioIntelligenceHandler,
} from "./portfolio-intelligence";
import { httpServiceKind } from "./http-service";
import { mcpServiceKind } from "./mcp";
import catalogJson from "./registry.json";

const factories: Record<string, ServiceKindFactory> = {
  "copilot-agent": copilotAgentKind,
  "foundry-agent": foundryAgentKind,
  "http-service": httpServiceKind,
  mcp: mcpServiceKind,
};

export interface SampleServiceRegistryOptions {
  hostCapabilities?: Iterable<string>;
  deterministicHandlers?: Record<string, DeterministicServiceHandler>;
  resolveCredential?: (reference: string) => Promise<unknown>;
  clearCredential?: (reference: string) => void | Promise<void>;
  authorizeEndpoint?: (kind: string, endpoint: URL) => boolean | Promise<boolean>;
  execute?: (request: unknown) => Promise<unknown>;
}

export function createSampleServiceKindRegistry(
  options: SampleServiceRegistryOptions = {}
): ServiceKindRegistry {
  const registry = new ServiceKindRegistry(options);
  const enabled = Object.entries(catalogJson.kinds)
    .filter(([, admission]) => admission.enabled)
    .map(([kind]) => kind);

  for (const kind of enabled) {
    const factory = kind === "deterministic-agent"
      ? createDeterministicAgentKind({
          [DETERMINISTIC_PORTFOLIO_PROVIDER]: portfolioIntelligenceHandler,
          ...options.deterministicHandlers,
        })
      : factories[kind];
    if (!factory) throw new Error(`Enabled sample service kind '${kind}' has no implementation`);
    registry.register(factory);
  }
  return registry;
}

export * from "./deterministic-agent";
export * from "./portfolio-intelligence";
export * from "./worker-service-kind";
