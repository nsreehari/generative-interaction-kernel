import type { Json } from "@gik/kernel";
import type { EffectHandlerMap } from "@gik/react";

import passwordSprayMailbox from "../../../incident-report-explorer/incident-report.md?raw";
import blobStorageExfiltration from "../../../incident-report-explorer/sample-incidents/blob-storage-exfiltration.md?raw";
import deviceCodeBec from "../../../incident-report-explorer/sample-incidents/device-code-bec.md?raw";
import identityCompromise from "../../../incident-report-explorer/sample-incidents/identity-compromise.md?raw";
import supplyChainSapBec from "../../../incident-report-explorer/sample-incidents/supply-chain-sap-bec.md?raw";
import blobStorageExfiltrationModel from "../../fixtures/blob-storage-exfiltration.json";
import deviceCodeBecModel from "../../fixtures/device-code-bec.json";
import identityCompromiseModel from "../../fixtures/identity-compromise.json";
import passwordSprayMailboxModel from "../../fixtures/password-spray-mailbox.json";
import supplyChainSapBecModel from "../../fixtures/supply-chain-sap-bec.json";

export const cachedSampleReports = [
  { id: "password-spray-mailbox", content: passwordSprayMailbox, model: passwordSprayMailboxModel },
  { id: "blob-storage-exfiltration", content: blobStorageExfiltration, model: blobStorageExfiltrationModel },
  { id: "identity-compromise", content: identityCompromise, model: identityCompromiseModel },
  { id: "device-code-bec", content: deviceCodeBec, model: deviceCodeBecModel },
  { id: "supply-chain-sap-bec", content: supplyChainSapBec, model: supplyChainSapBecModel },
] as const;

function sample(id: unknown) {
  const value = cachedSampleReports.find((candidate) => candidate.id === id);
  if (!value) throw new Error("Unknown cached incident report");
  return value;
}

function sampleState(value: typeof cachedSampleReports[number]) {
  return {
    selectedSampleId: value.id,
    content: value.content,
    intelligence: value.model as Json,
    analyzedContent: value.content,
    error: "",
  };
}

export function hydrateState(state: Record<string, unknown>): void {
  const incident = state.incident;
  if (!incident || typeof incident !== "object" || Array.isArray(incident)) return;
  Object.assign(incident, sampleState(cachedSampleReports[0]));
}

const handlers: EffectHandlerMap = {
  selectCachedSampleReport: (context) => ({
    ops: Object.entries(sampleState(sample(context.payload.value)))
      .map(([key, value]) => context.set(`incident.${key}`, value as Json)),
  }),
};

export default handlers;
