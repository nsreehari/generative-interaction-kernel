import type { Json } from "@gik/kernel";
import type { BundleRuntime } from "@gik/react";
import type { OrganismControlContract } from "../../blueprints/live-workspace-soc/native/projection_views/control-contract";

export interface ControlRequest {
  id: string;
  targetBlueprintId: string;
  token: number;
  command: string;
  actorId?: string;
  payload?: Record<string, Json>;
}

export interface ControlReceipt {
  requestId: string;
  token: number;
  command: string;
  status: "completed" | "rejected" | "failed";
  outcome?: string;
  result?: Record<string, Json>;
}

export function createHeadlessControlRuntime(runtime: BundleRuntime, contract: OrganismControlContract) {
  const commands = new Map(contract.commands.map((descriptor) => [descriptor.command, descriptor]));
  return {
    async dispatch(request: ControlRequest): Promise<ControlReceipt> {
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