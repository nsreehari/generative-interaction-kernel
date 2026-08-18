import { describe, expect, it } from "vitest";
import { createNodeHost } from "../apps/node-host/service";

async function eventually(assertion: () => void | Promise<void>): Promise<void> {
  const deadline = Date.now() + 5_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}

describe("Node nested report Blueprint composition", () => {
  it("restores and renders the shell-owned semantic report without an explorer child", async () => {
    const host = await createNodeHost({
      profile: "incident-analysis-new-shell",
      externalContext: {},
      environment: {},
      port: 0,
    });
    try {
      await host.controlface.whenIdle();
      expect(host.controlface.getProgram().graph?.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "analysis-selection-evaluate",
          inputs: expect.objectContaining({
            selection: "incident.selection",
          }),
        }),
        expect.objectContaining({
          id: "report-analysis-evaluate",
          inputs: expect.objectContaining({
            reportContent: "selected-report-content",
            selectedModel: "selected-model",
            savedReportEnvelope: "saved-report-lookup-envelope",
          }),
        }),
      ]));

      await host.controlface.emit({
        node: "analysis-selection",
        name: "save",
        payload: { values: { sourceReport: "password-spray-mailbox" } },
      });
      expect(host.controlface.getState()).toMatchObject({
        incident: { selection: { sourceReport: "password-spray-mailbox" } },
      });
      await host.controlface.whenIdle();
      await eventually(async () => {
        const children = [...host.hostedControlFaces().values()];
        expect(children).toHaveLength(1);
        expect(children[0]?.getBlueprint()?.payload.id).toBe("generated-incident-report");
        expect(JSON.stringify(await children[0]!.getTree())).toContain("68b54272-f60b-53fa-b3d4-2494c7bd598d");
      });
      expect(host.controlface.getState()).toMatchObject({
        "saved-report-lookup-envelope": { asOn: "2026-07-17T23:10:00Z" },
      });
      expect(JSON.stringify(host.controlface.getProgram())).not.toContain("incident-report-explorer");
    } finally {
      await host.stop();
    }
  });
});