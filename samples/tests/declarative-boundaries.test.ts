import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const samplesRoot = fileURLToPath(new URL("../", import.meta.url));
const authoredRoots = ["profiles", "bundles"] as const;
const implementationLeaves = new Set(["projection_views", "effect_handlers"]);
const legacyCompilerAllowlist = ["live-workspace-soc"] as const;

function filesBelow(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = `${path}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

test("sample Profiles and Bundles keep TypeScript inside native leaf directories", () => {
  const violations = authoredRoots.flatMap((root) => filesBelow(`${samplesRoot}/${root}`))
    .filter((path) => /\.tsx?$/.test(path))
    .filter((path) => !path.split(/[\\/]/).some((part) => implementationLeaves.has(part)))
    .map((path) => path.slice(samplesRoot.length + 1).replaceAll("\\", "/"))
    .sort();

  assert.deepEqual(violations, [], [
    "Profiles and Bundles are declarative JSON artifacts.",
    "Move tests outside the authored directories and implementation into projection_views/effect_handlers:",
    ...violations,
  ].join("\n"));
});

test("sample compiler residue stays explicit and temporary", () => {
  const compilerEntries = readdirSync(`${samplesRoot}/compilers`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(compilerEntries, [...legacyCompilerAllowlist].sort(), [
    "Sample blueprint compilers are migration residue, not an open extension point.",
    "Only explicitly approved legacy compiler folders may remain under samples/compilers:",
    ...compilerEntries,
  ].join("\n"));
});