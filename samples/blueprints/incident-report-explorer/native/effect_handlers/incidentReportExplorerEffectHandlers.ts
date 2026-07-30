import type { EffectHandlerMap } from "@gik/react";
import type { Json } from "@gik/kernel";

import reportMarkdown from "../../incident-report.md?raw";
import blobStorageExfiltration from "../../sample-incidents/blob-storage-exfiltration.md?raw";
import deviceCodeBec from "../../sample-incidents/device-code-bec.md?raw";
import identityCompromise from "../../sample-incidents/identity-compromise.md?raw";
import supplyChainSapBec from "../../sample-incidents/supply-chain-sap-bec.md?raw";

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
  const incident = state.incident;
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
        ctx.set("incident.selectedSampleId", sample.id),
        ctx.set("incident.content", sample.content),
        ctx.set("incident.formValue", { content: sample.content } as Json),
        ctx.set("incident.error", ""),
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