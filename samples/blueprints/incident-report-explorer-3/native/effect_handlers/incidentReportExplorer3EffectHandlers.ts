import type { EffectHandlerMap } from "@gik/react";
import type { Json } from "@gik/kernel";

import passwordSprayMailbox from "../../../incident-report-explorer/incident-report.md?raw";
import blobStorageExfiltration from "../../../incident-report-explorer/sample-incidents/blob-storage-exfiltration.md?raw";
import deviceCodeBec from "../../../incident-report-explorer/sample-incidents/device-code-bec.md?raw";
import identityCompromise from "../../../incident-report-explorer/sample-incidents/identity-compromise.md?raw";
import supplyChainSapBec from "../../../incident-report-explorer/sample-incidents/supply-chain-sap-bec.md?raw";

export const sampleReports = [
  { id: "password-spray-mailbox", content: passwordSprayMailbox },
  { id: "blob-storage-exfiltration", content: blobStorageExfiltration },
  { id: "identity-compromise", content: identityCompromise },
  { id: "device-code-bec", content: deviceCodeBec },
  { id: "supply-chain-sap-bec", content: supplyChainSapBec },
] as const;

export function hydrateState(state: Record<string, unknown>): void {
  const incident = state.incident3;
  if (!incident || typeof incident !== "object" || Array.isArray(incident)) return;
  Object.assign(incident, {
    selectedSampleId: sampleReports[0].id,
    content: sampleReports[0].content,
    formValue: { content: sampleReports[0].content },
  });
}

const handlers: EffectHandlerMap = {
  selectSampleReport: (ctx) => {
    const sample = sampleReports.find(({ id }) => id === ctx.payload.value);
    if (!sample) throw new Error("Unknown sample incident report");
    return { ops: [
      ctx.set("incident3.selectedSampleId", sample.id),
      ctx.set("incident3.content", sample.content),
      ctx.set("incident3.formValue", { content: sample.content } as Json),
      ctx.set("incident3.error", ""),
    ] };
  },
  saveReport: (ctx) => {
    const values = ctx.payload.values;
    const content = values && typeof values === "object" && !Array.isArray(values)
      ? String(values.content ?? "").trim()
      : "";
    if (!content) throw new Error("Report content is required");
    return { ops: [
      ctx.set("incident3.content", content),
      ctx.set("incident3.formValue", { content } as Json),
      ctx.set("incident3.error", ""),
    ] };
  },
  prepareAnalysis: (ctx) => ({ ops: [
    ctx.set("incident3.pendingContent", ctx.get("incident3.content") ?? ""),
    ctx.set("incident3.error", ""),
  ] }),
};

export default handlers;