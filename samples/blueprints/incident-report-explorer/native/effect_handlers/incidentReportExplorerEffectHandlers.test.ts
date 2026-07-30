import { describe, expect, it } from "vitest";

import handlers, { findSampleReport, hydrateState, sampleReports } from "./incidentReportExplorerEffectHandlers";

const set = (path: string, value: unknown) => ({ op: "set", path, value });

describe("incident report explorer effects", () => {
  it("hydrates the default report from the explicit sample catalog", () => {
    const state = { incident: {} };
    hydrateState(state);

    expect(sampleReports).toHaveLength(5);
    expect(state.incident).toMatchObject({
      selectedSampleId: "password-spray-mailbox",
      content: sampleReports[0].content,
      formValue: { content: sampleReports[0].content },
    });
  });

  it("selects a sample as saved content without replacing prior analysis", async () => {
    const sample = findSampleReport("device-code-bec");
    const result = await handlers.selectSampleReport({
      payload: { value: "device-code-bec" },
      set,
    } as never);

    expect(sample).toBeDefined();
    expect(result).toEqual({
      ops: [
        set("incident.selectedSampleId", "device-code-bec"),
        set("incident.content", sample?.content),
        set("incident.formValue", { content: sample?.content }),
        set("incident.error", ""),
      ],
    });
  });

  it("rejects unknown sample ids", () => {
    expect(() => handlers.selectSampleReport({ payload: { value: "missing" } } as never)).toThrow("Unknown sample incident report");
  });
});