import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { test } from "vitest";

const bundlesRoot = join(import.meta.dirname, "../../../../bundles");
const forbidden = [
  /\bServiceKindRegistry\b/,
  /\bQueueFace\b/,
  /\bbindServiceUse(?:Sync)?\b/,
  /from\s+["'][^"']*services\/foundry-agent["']/,
  /from\s+["'][^"']*live-credentials["']/,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.includes(".test.") ? [path] : [];
  });
}

test("Blueprint Bundles do not host services or credentials", () => {
  const violations = sourceFiles(bundlesRoot).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    return forbidden
      .filter((pattern) => pattern.test(source))
      .map((pattern) => `${relative(bundlesRoot, path)} matches ${pattern}`);
  });
  assert.deepEqual(violations, []);
});
