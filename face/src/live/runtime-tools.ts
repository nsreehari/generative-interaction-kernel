// The tool IMPLEMENTATIONS that require a live runtime. These are the read/write control-plane
// operations over a running ControlFace: inspect (getState/getTree), drive (emit), and full
// time-travel control-plane operations (checkpoint/restore/effectsSince/compensate).

import type { Checkpoint, GupEvent, OrchestratorEffect } from "../../../kernel/src/index";
import type { McpTool } from "../tool-surface";
import type { ControlFace } from "./controlface";

const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const any = { type: "object" } as const;
const checkpointSchema = obj({ rev: { type: "number" }, state: any }, ["rev", "state"]);
const effectsSchema = { type: "array", items: any } as const;

export function runtimeTools(face: ControlFace): McpTool[] {
  return [
    {
      name: "getState",
      description: "Snapshot the live kernel state (all namespaces) as JSON.",
      inputSchema: obj({}),
      handler: () => face.getState(),
    },
    {
      name: "getTree",
      description: "Resolve and return the current render tree as JSON.",
      inputSchema: obj({}),
      handler: () => face.getTree(),
    },
    {
      name: "emit",
      description: "Drive the kernel with a GUP event and return the resulting patch (also broadcast to render clients).",
      inputSchema: obj({ event: any }, ["event"]),
      handler: (a) => face.emit(a.event as GupEvent),
    },
    {
      name: "checkpoint",
      description: "Capture a restorable checkpoint (rev + state) of the live kernel.",
      inputSchema: obj({}),
      handler: () => face.checkpoint(),
    },
    {
      name: "restore",
      description: "Restore pure state to a prior checkpoint (undo or redo) and return the rollback patch.",
      inputSchema: obj({ checkpoint: checkpointSchema }, ["checkpoint"]),
      handler: (a) => face.restore(a.checkpoint as Checkpoint),
    },
    {
      name: "effectsSince",
      description: "List the recorded external effects since a given revision.",
      inputSchema: obj({ rev: { type: "number" } }, ["rev"]),
      handler: (a) => face.effectsSince(Number(a.rev)),
    },
    {
      name: "compensate",
      description: "Route effects through the host compensation seam, in the order supplied, and return the compensation patch.",
      inputSchema: obj({ effects: effectsSchema }, ["effects"]),
      handler: (a) => face.compensate((a.effects as OrchestratorEffect[]) ?? []),
    },
  ];
}
