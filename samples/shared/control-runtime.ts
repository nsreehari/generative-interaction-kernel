import type { Json } from "@gik/kernel";
import type { BundleRuntime } from "@gik/react";

export interface ControlCommandDescriptor {
  command: string;
  nodeId: string;
  event: string;
}

export interface OrganismControlContract {
  blueprintId: string;
  commands: ControlCommandDescriptor[];
  humanGates: string[];
  observableOutcomes: string[];
}

export interface ControlRequest {
  id: string;
  targetBlueprintId: string;
  token: number;
  command: string;
  commands?: string[];
  commandIndex?: number;
  actorId?: string;
  payload?: Record<string, Json>;
  correlationId?: string;
  waitAfterMs?: number;
}

export interface ControlReceipt {
  requestId: string;
  token: number;
  command: string;
  status: "completed" | "rejected" | "failed";
  outcome?: string;
  result?: Record<string, Json>;
}

export interface ControlRuntime {
  dispatch(request: ControlRequest): Promise<ControlReceipt>;
  snapshot(): Record<string, Json>;
}

export function createHeadlessControlRuntime(
  runtime: BundleRuntime,
  contract: OrganismControlContract
): ControlRuntime {
  const commands = new Map(contract.commands.map((descriptor) => [descriptor.command, descriptor]));
  return {
    async dispatch(request) {
      if (request.targetBlueprintId !== contract.blueprintId) {
        return { requestId: request.id, token: request.token, command: request.command, status: "rejected", outcome: "incompatible-blueprint" };
      }
      const descriptor = commands.get(request.command);
      if (!descriptor) {
        return { requestId: request.id, token: request.token, command: request.command, status: "rejected", outcome: "unsupported-command" };
      }
      if (contract.humanGates.includes(request.command)) {
        return { requestId: request.id, token: request.token, command: request.command, status: "rejected", outcome: "human-authorization-required" };
      }
      try {
        runtime.state.apply([{ op: "set", path: "control.request", value: request as unknown as Json }]);
        await runtime.controller.emit(descriptor.nodeId, descriptor.event, request.payload ?? {}, request.actorId);
        const receipt = runtime.state.get("control.receipt") as unknown as ControlReceipt | undefined;
        if (receipt?.requestId === request.id && receipt.token === request.token && receipt.command === request.command) {
          return receipt;
        }
        return { requestId: request.id, token: request.token, command: request.command, status: "completed" };
      } catch (error) {
        return {
          requestId: request.id,
          token: request.token,
          command: request.command,
          status: "failed",
          outcome: error instanceof Error ? error.message : "dispatch-failed",
        };
      }
    },
    snapshot: () => runtime.state.snapshot(),
  };
}
