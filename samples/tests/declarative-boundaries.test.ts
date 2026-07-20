import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const samplesRoot = fileURLToPath(new URL("../", import.meta.url));
const authoredRoots = ["profiles", "bundles"] as const;
const implementationLeaves = new Set(["projection_views", "effect_handlers"]);

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