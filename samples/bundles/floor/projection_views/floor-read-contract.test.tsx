import { test } from "vitest";
import assert from "node:assert/strict";

import { PRIMITIVE_CAPABILITIES, FLOOR_READ_KEYS } from "./capabilities";

// --- PLATFORM guardrail for the floor read-key contract ---------------------------------------
//
// FLOOR_READ_KEYS declares, per floor capability, the named props a lowering recipe may bind data
// into via `read`. This test keeps that contract internally consistent with the capability
// manifest. It is platform-scoped: it says nothing about any particular bundle or sample — only
// that the floor's own declared surface is coherent. The complementary SAMPLE guardrail (does a
// given profile's recipes obey this contract) lives with the samples, in
// samples/profiles/recipe-contract.test.ts.

test("every FLOOR_READ_KEYS entry targets a declared floor capability", () => {
  const unknown = Object.keys(FLOOR_READ_KEYS).filter((name) => !(name in PRIMITIVE_CAPABILITIES));
  assert.deepEqual(unknown, [], `read-key contract references capabilities absent from the manifest: ${unknown.join(", ")}`);
});

test("every capability declaring a dataProp lists it as an accepted read key", () => {
  const gaps: string[] = [];
  for (const [name, descriptor] of Object.entries(PRIMITIVE_CAPABILITIES)) {
    const dataProp = descriptor.dataProp;
    if (!dataProp) continue;
    const accepted = FLOOR_READ_KEYS[name];
    if (!accepted) {
      gaps.push(`ui:${name}: declares dataProp "${dataProp}" but has no FLOOR_READ_KEYS entry`);
    } else if (!accepted.includes(dataProp)) {
      gaps.push(`ui:${name}: dataProp "${dataProp}" is not in its accepted read keys {${accepted.join(", ")}}`);
    }
  }
  assert.deepEqual(gaps, [], gaps.join("\n"));
});

test("accepted read keys are non-empty and unique per capability", () => {
  const problems: string[] = [];
  for (const [name, keys] of Object.entries(FLOOR_READ_KEYS)) {
    if (keys.length === 0) problems.push(`ui:${name}: empty read-key list`);
    if (new Set(keys).size !== keys.length) problems.push(`ui:${name}: duplicate read keys {${keys.join(", ")}}`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});
