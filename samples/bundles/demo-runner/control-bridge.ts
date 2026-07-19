import type { Json, StateModel } from "@gik/kernel";
import type { GenUIController, GenUISource } from "@gik/react";
import type {
  ControlReceipt,
  ControlRequest,
  OrganismControlContract,
} from "../../shared/control-runtime";

export function withDemoHumanGate(
  source: GenUISource,
  control: StateModel,
  contract: OrganismControlContract
): GenUISource {
  return {
    getTree: () => source.getTree(),
    subscribe: (listener) => source.subscribe(listener),
    start: () => source.start(),
    async emit(node, name, payload, actorId) {
      const request = control.get("control.request") as unknown as ControlRequest | null;
      const gateCommand = request?.command === "$human-gate" && request.commands?.length === 1
        ? request.commands[0]
        : undefined;
      const descriptor = gateCommand
        ? contract.commands.find((candidate) => candidate.command === gateCommand)
        : undefined;
      const completesGate = Boolean(
        request
        && gateCommand
        && contract.humanGates.includes(gateCommand)
        && descriptor?.nodeId === node
        && descriptor.event === name
        && actorId?.trim()
        && actorId === request.actorId
      );

      const result = await source.emit(node, name, payload, actorId);
      if (completesGate && request) {
        const receipt: ControlReceipt = {
          requestId: request.id,
          token: request.token,
          command: "$human-gate",
          status: "completed",
          outcome: "authorized",
        };
        control.apply([{ op: "set", path: "control.receipt", value: receipt as unknown as Json }]);
      }
      return result;
    },
  };
}

export async function dispatchDemoControlRequest(
  controller: GenUIController,
  control: StateModel,
  contract: OrganismControlContract,
  request: ControlRequest
): Promise<ControlReceipt> {
  const descriptor = contract.commands.find((candidate) => candidate.command === request.command);
  const gated = contract.humanGates.includes(request.command);
  if (request.targetBlueprintId !== contract.blueprintId || !descriptor || gated) {
    const receipt: ControlReceipt = {
      requestId: request.id,
      token: request.token,
      command: request.command,
      status: "rejected",
      outcome: request.targetBlueprintId !== contract.blueprintId
        ? "incompatible-blueprint"
        : gated
          ? "human-authorization-required"
          : "unsupported-command",
    };
    control.apply([{ op: "set", path: "control.receipt", value: receipt as unknown as Json }]);
    return receipt;
  }

  try {
    await controller.emit(descriptor.nodeId, descriptor.event, request.payload ?? {}, request.actorId);
    const targetReceipt = control.get("control.receipt") as unknown as ControlReceipt | undefined;
    const receipt = targetReceipt?.requestId === request.id
      && targetReceipt.token === request.token
      && targetReceipt.command === request.command
      ? targetReceipt
      : {
          requestId: request.id,
          token: request.token,
          command: request.command,
          status: "completed" as const,
        };
    control.apply([{ op: "set", path: "control.receipt", value: receipt as unknown as Json }]);
    return receipt;
  } catch (error) {
    const receipt: ControlReceipt = {
      requestId: request.id,
      token: request.token,
      command: request.command,
      status: "failed",
      outcome: error instanceof Error ? error.message : "dispatch-failed",
    };
    control.apply([{ op: "set", path: "control.receipt", value: receipt as unknown as Json }]);
    return receipt;
  }
}
