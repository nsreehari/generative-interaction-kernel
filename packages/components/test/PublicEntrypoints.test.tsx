import assert from "node:assert/strict";
import { test } from "vitest";

import * as rootEntryPoint from "../src/shared";
import * as primitiveEntryPoint from "../src/primitives";
import * as semanticEntryPoint from "../src/semantic";
import * as securityEntryPoint from "../src/security";
import * as softwareEntryPoint from "../src/software";

const { primitiveComponentDefinitions } = primitiveEntryPoint;
const { semanticComponentDefinitions } = semanticEntryPoint;
const { securityComponentDefinitions } = securityEntryPoint;
const { softwareComponentDefinitions } = softwareEntryPoint;

test("semantic and primitive entry points expose distinct component layers", () => {
  assert.ok("argument" in semanticComponentDefinitions);
  assert.ok("event-series" in semanticComponentDefinitions);
  assert.ok(!("chart" in semanticComponentDefinitions));
  assert.ok("chart" in primitiveComponentDefinitions);
  assert.ok("collection-board" in primitiveComponentDefinitions);
  assert.ok("graph-diagram" in primitiveComponentDefinitions);
  assert.ok("source-viewer" in primitiveComponentDefinitions);
  assert.ok("access-gate" in primitiveComponentDefinitions);
  assert.ok(!("event-series" in primitiveComponentDefinitions));
  assert.ok("timer-button" in primitiveComponentDefinitions);
  assert.ok("todo-list" in primitiveComponentDefinitions);
  assert.equal(primitiveComponentDefinitions.chart.capability, "primitive:chart");
  assert.ok(!("attack-path" in semanticComponentDefinitions));
  assert.equal(securityComponentDefinitions["attack-path"].capability, "security:attack-path");
  assert.equal(softwareComponentDefinitions["source-findings"].capability, "software:source-findings");
  assert.equal(softwareComponentDefinitions["source-comparison"].capability, "software:source-comparison");
});

test("primitive authoring APIs expose closed contracts and scoped agent tools", () => {
  const catalog = primitiveEntryPoint.listPrimitiveComponents();
  assert.ok(catalog.some((entry) => entry.id === "form" && entry.capability === "primitive:form"));
  assert.ok(catalog.some((entry) => entry.id === "access-gate" && entry.capability === "primitive:access-gate"));
  assert.ok(catalog.some((entry) => entry.id === "editable-table" && entry.capability === "primitive:editable-table"));
  assert.ok(catalog.some((entry) => entry.id === "collection-board" && entry.capability === "primitive:collection-board"));
  assert.ok(catalog.some((entry) => entry.id === "source-viewer" && entry.capability === "primitive:source-viewer"));
  assert.ok(catalog.some((entry) => entry.id === "todo-list" && entry.capability === "primitive:todo-list"));

  const description = primitiveEntryPoint.describePrimitiveComponent("form");
  assert.equal(description.capability, "primitive:form");
  assert.equal(description.propsSchema.additionalProperties, false);
  assert.ok(description.authoring.rules.length > 0);

  const trial = primitiveEntryPoint.materializePrimitiveComponentTrial("primitive:form");
  assert.equal(primitiveEntryPoint.validatePrimitiveComponentProps("form", trial.props).ok, true);
  const preflight = primitiveEntryPoint.preflightPrimitiveComponent("form", trial.props);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.capability, "primitive:form");
  assert.deepEqual(preflight.declaredEvents, primitiveComponentDefinitions.form.events);

  const kit = primitiveEntryPoint.getPrimitiveComponentAgentKit([
    "form",
    "primitive:editable-table",
    "primitive:form",
  ]);
  assert.deepEqual(kit.capabilities, ["primitive:form", "primitive:editable-table"]);
  assert.match(kit.instructions, /^# GIK Primitive Component Authoring/);
  assert.match(kit.instructions, /schemas are closed/);
  assert.match(kit.instructions, /Emitted events:/);
  assert.match(kit.instructions, /Variants:/);
  assert.match(kit.instructions, /pure ACX authoring operations, not live AX runtime verification/);

  const describeTool = kit.tools.find((tool) => tool.name === "describePrimitiveComponent")!;
  const capability = (describeTool.inputSchema.properties as Record<string, { enum: string[] }>).capability;
  assert.deepEqual(capability.enum, kit.capabilities);
  assert.throws(
    () => describeTool.handler({ capability: "primitive:chart" }),
    /Primitive component primitive:chart is outside this agent kit/,
  );
});

test("primitive entry point exports the complete primitive authoring API only", () => {
  assert.deepEqual(primitiveEntryPoint.primitiveComponentAuthoringTools.map((tool) => tool.name), [
    "listPrimitiveComponents",
    "describePrimitiveComponent",
    "validatePrimitiveComponentProps",
    "preflightPrimitiveComponent",
    "materializePrimitiveComponentTrial",
  ]);
  assert.equal(typeof primitiveEntryPoint.createPrimitiveComponentAuthoringTools, "function");
  assert.equal(typeof primitiveEntryPoint.getPrimitiveComponentAgentInstructions, "function");
  assert.equal(rootEntryPoint.listPrimitiveComponents, primitiveEntryPoint.listPrimitiveComponents);
  assert.equal(rootEntryPoint.getPrimitiveComponentAgentKit, primitiveEntryPoint.getPrimitiveComponentAgentKit);
  assert.equal("listPrimitiveComponents" in semanticEntryPoint, false);
  assert.deepEqual(securityEntryPoint.listSecurityComponents().map((entry) => entry.capability), ["security:attack-path"]);
  assert.deepEqual(softwareEntryPoint.listSoftwareComponents().map((entry) => entry.capability), ["software:source-findings", "software:source-comparison"]);
  assert.equal(rootEntryPoint.getSecurityComponentAgentKit, securityEntryPoint.getSecurityComponentAgentKit);
  assert.equal(rootEntryPoint.getSoftwareComponentAgentKit, softwareEntryPoint.getSoftwareComponentAgentKit);
  assert.throws(() => primitiveEntryPoint.describePrimitiveComponent("semantic:event-series"), /Unknown primitive component/);
});