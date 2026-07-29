import assert from "node:assert/strict";
import { test } from "vitest";
import { unwrap } from "@gik/kernel";
import { createDemoRunnerBundle, createGikControlHarnessBundle } from "../../packages/demo-runner-host/src";

test("inspector bundle depends only on the generic control inspection context", () => {
  const bundle = createGikControlHarnessBundle();
  const vocabulary = unwrap(bundle.vocabulary);
  const program = unwrap(bundle.program);
  const serializedProgram = JSON.stringify(program);

  assert.deepEqual(vocabulary.namespaces, ["inspector"]);
  assert.deepEqual(vocabulary.contexts, ["control"]);
  assert.match(serializedProgram, /control\.inspection/);
  assert.doesNotMatch(serializedProgram, /soc\.|demo\./);
  assert.deepEqual(Object.keys(bundle.state ?? {}), ["inspector"]);
});

test("runner keeps scenario state in demo and target exchange in control", () => {
  const bundle = createDemoRunnerBundle();
  const vocabulary = unwrap(bundle.vocabulary);
  const program = JSON.stringify(unwrap(bundle.program));

  assert.deepEqual(vocabulary.namespaces, ["runner"]);
  assert.deepEqual(vocabulary.contexts, ["demo", "control"]);
  assert.match(program, /demo\.presenter/);
  assert.match(program, /control\.receipt/);
  assert.doesNotMatch(program, /soc\./);
  assert.deepEqual(Object.keys(bundle.state ?? {}), ["runner"]);
});