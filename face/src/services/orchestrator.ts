import { executeQueuedCellSourceEffect } from "../../../blueprint/src/worker";
import type { Orchestrator, ServiceDeclaration, StateModel } from "../../../kernel/src/index";
import type { ServiceHost } from "./service-host";

export function createServiceOrchestrator(options: {
  host: Pick<ServiceHost, "invoke">;
  declarations: Record<string, ServiceDeclaration>;
  state: StateModel;
  fallback?: Orchestrator;
}): Orchestrator {
  return {
    invoke: (effect, control) => {
      if (effect.kind === "invoke" && effect.control.serviceRef && Object.hasOwn(options.declarations, effect.control.serviceRef))
        return executeQueuedCellSourceEffect(effect, options.state.snapshot(), queued => options.host.invoke(queued));
      if (!options.fallback?.invoke) return Promise.reject(new Error("No host executor is registered for this invocation."));
      return options.fallback.invoke(effect, control);
    },
    request: options.fallback?.request?.bind(options.fallback),
    route: options.fallback?.route?.bind(options.fallback),
    compensate: options.fallback?.compensate?.bind(options.fallback),
  };
}
