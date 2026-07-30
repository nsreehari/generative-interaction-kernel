import type { EffectHandlerMap } from "@gik/react";
import type { Json } from "@gik/kernel";

import reportMarkdown from "../../incident-report.md?raw";

export function hydrateState(state: Record<string, unknown>): void {
  const incident = state.incident;
  if (!incident || typeof incident !== "object" || Array.isArray(incident)) return;
  Object.assign(incident, {
    content: reportMarkdown,
    formValue: { content: reportMarkdown },
  });
}

const handlers: EffectHandlerMap = {
  saveReport: (ctx) => {
    const values = ctx.payload.values;
    const content = values && typeof values === "object" && !Array.isArray(values)
      ? String(values.content ?? "").trim()
      : "";
    if (!content) throw new Error("Report content is required");
    return {
      ops: [
        ctx.set("incident.content", content),
        ctx.set("incident.formValue", { content } as Json),
        ctx.set("incident.error", ""),
      ],
    };
  },
  prepareAnalysis: (ctx) => ({
    ops: [
      ctx.set("incident.pendingContent", ctx.get("incident.content") ?? ""),
      ctx.set("incident.error", ""),
    ],
  }),
};

export default handlers;