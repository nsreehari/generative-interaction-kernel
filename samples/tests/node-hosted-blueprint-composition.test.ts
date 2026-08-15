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

describe("Node hosted Blueprint composition", () => {
  it.each([
    "incident-report-explorer-1a",
    "incident-report-explorer-2",
    "incident-report-explorer-3",
  ])("mounts and automatically runs %s selected by host launch configuration", async (analyzerId) => {
    const host = await createNodeHost({
      profile: "incident-analysis-new-shell",
      externalContext: {
        analyzer_blueprint_ref: `blueprint:${analyzerId}@1.0.0`,
      },
      environment: {},
      port: 0,
    });
    try {
      await host.controlface.whenIdle();
      if (analyzerId === "incident-report-explorer-2") {
        expect(host.controlface.getProgram().graph?.nodes).toEqual(expect.arrayContaining([
          expect.objectContaining({
            id: "analyzer-options-evaluate",
            inputs: { analyzerBlueprintRef: "analyzer_blueprint_ref" },
          }),
          expect.objectContaining({
            id: "selected-report-key-evaluate",
            inputs: { selectedReportKey: "incidentShell.selected_report_key" },
          }),
          expect.objectContaining({
            id: "cache-retriever-evaluate",
            inputs: {
              selected_report_key: "selected_report_key",
              analysis_key: "analysis_key",
              __sources: { token: "blueprintRunState.cells.cache-retriever.sourceValues", optional: true },
            },
          }),
        ]));
        expect(host.controlface.getState().blueprintRunState).toMatchObject({
          cells: {
            "cache-retriever": {
              sources: [expect.objectContaining({ lastRequestedToken: expect.any(String) })],
            },
          },
        });
        expect(host.controlface.getState().incidentShell).toMatchObject({
          cached_analysis_report: {
            identity: { incidentId: "68b54272-f60b-53fa-b3d4-2494c7bd598d" },
          },
          analysis_as_on: "2026-07-17T23:10:00Z",
        });
      }
      expect([...host.hostedControlFaces().keys()]).toEqual(["presentation-roots/incident-analyzer"]);
      const analyzer = host.hostedControlFaces().get("presentation-roots/incident-analyzer");
      expect(analyzer).toBeDefined();
      expect(JSON.stringify(await analyzer!.getTree())).toContain("report-presentation");
      if (analyzerId === "incident-report-explorer-2") {
        const parentTree = JSON.stringify(await host.controlface.getTree());
        expect(parentTree).toContain("68b54272-f60b-53fa-b3d4-2494c7bd598d");
        expect(parentTree).toContain("2026-07-17T23:10:00Z");
        await eventually(async () => {
          const currentAnalyzer = host.hostedControlFaces().get("presentation-roots/incident-analyzer");
          expect(currentAnalyzer).toBeDefined();
          const tree = JSON.stringify(await currentAnalyzer!.getTree());
          expect(tree).toContain("68b54272-f60b-53fa-b3d4-2494c7bd598d");
          expect(tree).toContain("2026-07-17T23:10:00Z");
        });
      } else {
        await eventually(() => {
          const state = analyzer!.getState() as {
            blueprintRunState?: { cells?: Record<string, { sources?: Array<{ lastRequestedToken?: string | null }> }> };
          };
          expect(state.blueprintRunState?.cells?.["analysis-runner"]?.sources?.[0]?.lastRequestedToken).toBeTruthy();
        });
      }
    } finally {
      await host.stop();
    }
  });

  it("switches hosted analyzers from the shell selector and restores analyzer-specific cache", async () => {
    const host = await createNodeHost({
      profile: "incident-analysis-new-shell",
      externalContext: {
        analyzer_blueprint_ref: "blueprint:incident-report-explorer-2@1.0.0",
      },
      environment: {},
      port: 0,
    });
    try {
      await host.controlface.whenIdle();
      const hostedAnalyzer = () => host.hostedControlFaces().get("presentation-roots/incident-analyzer");
      expect(hostedAnalyzer()?.getBlueprint()?.payload.id).toBe("incident-report-explorer-2");

      await host.controlface.emit({
        node: "analyzer-options",
        name: "select",
        payload: { value: "blueprint:incident-report-explorer-3@1.0.0" },
      });
      await host.controlface.whenIdle();
      expect(hostedAnalyzer()?.getBlueprint()?.payload.id).toBe("incident-report-explorer-3");
      expect(host.controlface.getState().incidentShell).toMatchObject({ cached_analysis_report: null, analysis_as_on: null });

      await host.controlface.emit({
        node: "analyzer-options",
        name: "select",
        payload: { value: "blueprint:incident-report-explorer-2@1.0.0" },
      });
      await host.controlface.whenIdle();
      expect(hostedAnalyzer()?.getBlueprint()?.payload.id).toBe("incident-report-explorer-2");
      expect(host.controlface.getState().incidentShell).toMatchObject({
        cached_analysis_report: {
          identity: { incidentId: "68b54272-f60b-53fa-b3d4-2494c7bd598d" },
        },
        analysis_as_on: "2026-07-17T23:10:00Z",
      });

      await host.controlface.emit({
        node: "source-options",
        name: "select",
        payload: { value: "blob-storage-exfiltration" },
      });
      await host.controlface.whenIdle();
      expect(hostedAnalyzer()?.getBlueprint()?.payload.id).toBe("incident-report-explorer-2");
      expect(host.controlface.getState().incidentShell).toMatchObject({
        selected_report_key: "blob-storage-exfiltration",
        cached_analysis_report: null,
        analysis_report: null,
        analysis_as_on: null,
        cache_lookup_complete: true,
      });
      await eventually(() => {
        const state = hostedAnalyzer()?.getState() as {
          blueprintRunState?: { cells?: Record<string, { sources?: Array<{ lastRequestedToken?: string | null }> }> };
        } | undefined;
        expect(state?.blueprintRunState?.cells?.["analysis-runner"]?.sources?.[0]?.lastRequestedToken).toBeTruthy();
      });

      await host.controlface.emit({
        node: "source-options",
        name: "select",
        payload: { value: "password-spray-mailbox" },
      });
      await host.controlface.whenIdle();
      expect(host.controlface.getState().incidentShell).toMatchObject({
        cached_analysis_report: {
          identity: { incidentId: "68b54272-f60b-53fa-b3d4-2494c7bd598d" },
        },
        analysis_as_on: "2026-07-17T23:10:00Z",
        cache_lookup_complete: true,
      });
    } finally {
      await host.stop();
    }
  });
});