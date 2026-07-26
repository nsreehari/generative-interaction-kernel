import {
  defineExploration,
  type CellDefinition,
} from "@gik/blueprint";

export const portfolioCells: Readonly<Record<string, CellDefinition>> = {
  portfolio: { id: "portfolio", outputs: [{ token: "portfolio" }] },
  capitalGain: {
    id: "capitalGain",
    inputs: [{ token: "portfolio" }],
    outputs: [{ token: "capitalGain" }],
  },
  marketPrices: {
    id: "marketPrices",
    inputs: [{ token: "portfolio" }],
    outputs: [{ token: "marketPrices" }],
  },
  taxExposure: {
    id: "taxExposure",
    inputs: [{ token: "portfolio" }, { token: "capitalGain" }],
    outputs: [{ token: "taxExposure" }],
  },
  currentValue: {
    id: "currentValue",
    inputs: [{ token: "portfolio" }, { token: "marketPrices" }],
    outputs: [{ token: "currentValue" }],
  },
  recommendations: {
    id: "recommendations",
    inputs: [{ token: "currentValue" }, { token: "taxExposure" }],
  },
};

export const educationExploration = defineExploration({
  id: "education-branches",
  nodes: {
    tenthComplete: { id: "tenthComplete", label: "10th complete", unlocks: ["choose12th"] },
    intermediateMPC: { id: "intermediateMPC", label: "12th MPC" },
    intermediateBPC: { id: "intermediateBPC", label: "12th BPC" },
    intermediateHEC: { id: "intermediateHEC", label: "12th HEC" },
    engineering: { id: "engineering", label: "Engineering path" },
    dataScience: { id: "dataScience", label: "Data science path" },
    medicine: { id: "medicine", label: "Medicine path" },
    biotech: { id: "biotech", label: "Biotech path" },
    commerce: { id: "commerce", label: "Commerce path" },
    civilServices: { id: "civilServices", label: "Civil services path" },
  },
  choices: {
    choose12th: {
      id: "choose12th",
      label: "Choose 12th stream",
      requires: ["tenthComplete"],
      options: [
        { id: "mpc", label: "MPC", unlocks: ["intermediateMPC", "engineering", "dataScience"] },
        { id: "bpc", label: "BPC", unlocks: ["intermediateBPC", "medicine", "biotech"] },
        { id: "hec", label: "HEC", unlocks: ["intermediateHEC", "commerce", "civilServices"] },
      ],
    },
  },
});