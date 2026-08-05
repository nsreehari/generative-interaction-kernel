import type { EffectHandlerMap } from "@gik/react";
import type { Json } from "@gik/kernel";

import reportMarkdown from "../../../incident-report-explorer/incident-report.md?raw";
import blobStorageExfiltration from "../../../incident-report-explorer/sample-incidents/blob-storage-exfiltration.md?raw";
import deviceCodeBec from "../../../incident-report-explorer/sample-incidents/device-code-bec.md?raw";
import identityCompromise from "../../../incident-report-explorer/sample-incidents/identity-compromise.md?raw";
import supplyChainSapBec from "../../../incident-report-explorer/sample-incidents/supply-chain-sap-bec.md?raw";

export const sampleReports = [
  { id: "password-spray-mailbox", label: "Password spray and mailbox compromise", content: reportMarkdown },
  { id: "blob-storage-exfiltration", label: "Blob storage exfiltration", content: blobStorageExfiltration },
  { id: "identity-compromise", label: "Identity and cloud resource compromise", content: identityCompromise },
  { id: "device-code-bec", label: "Device-code phishing and BEC", content: deviceCodeBec },
  { id: "supply-chain-sap-bec", label: "Supply-chain SAP and procurement BEC", content: supplyChainSapBec },
] as const;

const defaultSample = sampleReports[0];

export function findSampleReport(id: unknown) {
  return sampleReports.find((sample) => sample.id === id);
}

export function hydrateState(state: Record<string, unknown>): void {
  const incident = state.incident1a;
  if (!incident || typeof incident !== "object" || Array.isArray(incident)) return;
  Object.assign(incident, {
    selectedSampleId: defaultSample.id,
    content: defaultSample.content,
    formValue: { content: defaultSample.content },
  });
}

const handlers: EffectHandlerMap = {
  selectSampleReport: (ctx) => {
    const sample = findSampleReport(ctx.payload.value);
    if (!sample) throw new Error("Unknown sample incident report");
    return {
      ops: [
        ctx.set("incident1a.selectedSampleId", sample.id),
        ctx.set("incident1a.content", sample.content),
        ctx.set("incident1a.formValue", { content: sample.content } as Json),
        ctx.set("incident1a.error", ""),
      ],
    };
  },
  saveReport: (ctx) => {
    const values = ctx.payload.values;
    const content = values && typeof values === "object" && !Array.isArray(values)
      ? String(values.content ?? "").trim()
      : "";
    if (!content) throw new Error("Report content is required");
    return {
      ops: [
        ctx.set("incident1a.content", content),
        ctx.set("incident1a.formValue", { content } as Json),
        ctx.set("incident1a.error", ""),
      ],
    };
  },
  prepareRefinement: (ctx) => ({
    ops: [
      ctx.set("incident1a.pendingContent", ctx.get("externalContext.content") ?? ctx.get("incident1a.content") ?? ""),
      ctx.set("incident1a.error", ""),
    ],
  }),
};

export default handlers;
