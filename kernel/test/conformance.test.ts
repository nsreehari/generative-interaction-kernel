// Behavioral conformance matrix runner (reference kernel). Loads every language-neutral
// case under conformance/cases/, validates it against the case schema, then executes it:
// seed -> init -> optional initial-resolve assertions -> each event step's exact patch and
// resolved-tree assertions. A future kernel (e.g. a C# core) ships its own runner over the
// same JSON cases to prove reducer equivalence.

import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv from "ajv";

import {
  InMemoryStateModel,
  Kernel,
  unwrap,
  type Json,
  type Orchestrator,
  type OrchestratorEffect,
  type OrchestratorResult,
  type PatchOp,
  type ResolvedNode,
} from "../src/index";

const casesDir = fileURLToPath(new URL("../../conformance/cases/", import.meta.url));
const caseSchema = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../conformance/conformance-case.schema.json", import.meta.url)),
    "utf8"
  )
);
const validateCase = new Ajv({ allErrors: true, strict: false }).compile(caseSchema);

interface ResolveExpect {
  id: string;
  visible?: boolean;
  fallback?: boolean;
  capability?: string;
  props?: Record<string, Json>;
}

interface Step {
  event: { node: string; name: string; payload?: Record<string, Json> };
  expectPatch?: { rev: number; ops: PatchOp[]; completedWithinRun?: unknown[] };
  expectSettledPatch?: { rev: number; ops: PatchOp[]; completedWithinRun?: unknown[] };
  expectResolve?: ResolveExpect[];
}

interface ScriptEntry {
  on: { kind: "invoke" | "route" | "request"; node?: string; tool?: string };
  result: OrchestratorResult;
}

interface ConformanceCase {
  name: string;
  vocabulary?: object;
  vocabularyRef?: string;
  program?: object;
  programRef?: string;
  seed?: PatchOp[];
  orchestrator?: ScriptEntry[];
  expectInvalid?: boolean;
  expectInitialResolve?: ResolveExpect[];
  steps?: Step[];
}

function loadRef(caseFile: string, ref: string): object {
  return JSON.parse(readFileSync(join(dirname(caseFile), ref), "utf8"));
}

// A deterministic, canned Orchestrator from a case's `orchestrator` script: each entry
// matches an effect (kind + optional node/tool) and returns fixed ops/events, settled
// inside the same dispatch. No clock, no IO — safe for the conformance contract.
function scriptedOrchestrator(script: ScriptEntry[]): Orchestrator {
  const match = (kind: ScriptEntry["on"]["kind"], e: OrchestratorEffect) =>
    script.find(
      (s) =>
        s.on.kind === kind &&
        (s.on.node === undefined || s.on.node === e.node) &&
        (s.on.tool === undefined || (e.kind === "invoke" && s.on.tool === e.control.tool))
    )?.result;
  return {
    invoke: async (e) => match("invoke", e),
    route: async (e) => match("route", e),
    request: async (e) => match("request", e),
  };
}

function find(node: ResolvedNode | null, id: string): ResolvedNode | undefined {
  if (!node) return undefined;
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return undefined;
}

function assertResolve(tree: ResolvedNode, expects: ResolveExpect[]): void {
  for (const e of expects) {
    const n = find(tree, e.id);
    assert.ok(n, `expected node '${e.id}' in resolved tree`);
    if (e.visible !== undefined) assert.equal(n.visible, e.visible, `${e.id}.visible`);
    if (e.fallback !== undefined) assert.equal(n.fallback, e.fallback, `${e.id}.fallback`);
    if (e.capability !== undefined) assert.equal(n.capability, e.capability, `${e.id}.capability`);
    for (const [key, value] of Object.entries(e.props ?? {})) {
      assert.deepEqual(n.props[key], value, `${e.id}.props.${key}`);
    }
  }
}

const files = readdirSync(casesDir)
  .filter((f) => f.endsWith(".case.json"))
  .sort();

assert.ok(files.length > 0, "expected at least one conformance case");

for (const file of files) {
  const path = join(casesDir, file);
  const c = JSON.parse(readFileSync(path, "utf8")) as ConformanceCase;

  test(`conformance: ${c.name}`, async () => {
    assert.ok(validateCase(c), `case failed schema: ${JSON.stringify(validateCase.errors)}`);

    const vocabulary = (c.vocabulary ?? loadRef(path, c.vocabularyRef!)) as never;
    const program = (c.program ?? loadRef(path, c.programRef!)) as never;

    if (c.expectInvalid) {
      assert.throws(() => new Kernel(vocabulary, program));
      return;
    }

    const namespaces = (unwrap(vocabulary) as { namespaces?: string[] }).namespaces ?? [];
    const store = new InMemoryStateModel(namespaces);
    if (c.seed) store.apply(c.seed);

    const kernel = new Kernel(vocabulary, program, {
      state: store,
      orchestrator: c.orchestrator ? scriptedOrchestrator(c.orchestrator) : undefined,
    });
    kernel.init();

    if (c.expectInitialResolve) assertResolve(await kernel.resolve(), c.expectInitialResolve);

    for (const step of c.steps ?? []) {
      const published: Array<{ rev: number; ops: PatchOp[] }> = [];
      const unsubscribe = kernel.subscribePatches((patch) => published.push(patch));
      const patch = await kernel.dispatch(step.event);
      if (step.expectPatch) assert.deepEqual(patch, step.expectPatch);
      await kernel.whenIdle();
      if (step.expectSettledPatch) assert.deepEqual(published.at(-1), step.expectSettledPatch);
      unsubscribe();
      if (step.expectResolve) assertResolve(await kernel.resolve(), step.expectResolve);
    }
  });
}
