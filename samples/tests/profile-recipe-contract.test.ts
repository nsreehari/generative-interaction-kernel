import { test } from "vitest";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  PRIMITIVE_CAPABILITIES,
  FLOOR_READ_KEYS,
  FLOOR_ALIAS,
} from "../bundles/floor/projection_views/capabilities";

// --- SAMPLE guardrail: do these profiles' lowering recipes obey the floor contract? -----------
//
// A lowering recipe emits `{ capability, read }` pairs, where each `read` key binds document data
// into a NAMED prop on the target leaf. If a recipe binds a key the leaf never consumes (e.g.
// `ui:form` <- read.schema when Form reads `fields`), the leaf silently renders empty. Props are
// open at the renderer boundary, so nothing else catches this class of mistake.
//
// The floor's declared read-key contract (FLOOR_READ_KEYS) is platform data, validated for internal
// consistency by adapters/react/test/floor-read-contract.test.tsx. This test checks the OTHER half:
// that the SAMPLE recipes shipped under samples/profiles bind only read keys that contract allows.
// App/bundle-declared capabilities (e.g. ui:board) are out of the floor's scope and skipped here.

interface RecipeEmit {
  capability: string;
  read?: Record<string, unknown>;
  file: string;
}

const PROFILES_DIR = fileURLToPath(new URL("../profiles", import.meta.url));
const FLOOR_PREFIX = `${FLOOR_ALIAS}:`;

function blueprintFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...blueprintFiles(full));
    else if (entry === "blueprint.json") out.push(full);
  }
  return out;
}

function collectEmits(value: unknown, file: string, sink: RecipeEmit[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectEmits(item, file, sink);
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const emit = obj.emit;
  if (emit && typeof emit === "object" && typeof (emit as Record<string, unknown>).capability === "string") {
    const e = emit as Record<string, unknown>;
    sink.push({
      capability: e.capability as string,
      read: e.read && typeof e.read === "object" ? (e.read as Record<string, unknown>) : undefined,
      file,
    });
  }
  for (const child of Object.values(obj)) collectEmits(child, file, sink);
}

function allEmits(): RecipeEmit[] {
  const sink: RecipeEmit[] = [];
  for (const file of blueprintFiles(PROFILES_DIR)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { payload?: { recipes?: unknown[] } };
    collectEmits(parsed.payload?.recipes ?? [], path.relative(PROFILES_DIR, file), sink);
  }
  return sink;
}

test("sample recipes only bind floor read-keys the target leaf consumes", () => {
  const emits = allEmits();
  assert.ok(emits.length > 0, "expected to discover recipe emits under samples/profiles");

  const violations: string[] = [];
  for (const emit of emits) {
    if (!emit.capability.startsWith(FLOOR_PREFIX)) continue;
    const name = emit.capability.slice(FLOOR_PREFIX.length);
    // Only floor primitives are governed by the floor read-key contract; app/bundle-declared
    // capabilities (e.g. ui:board) validate against their own bundle manifests.
    if (!(name in PRIMITIVE_CAPABILITIES)) continue;
    if (!emit.read) continue;

    const accepted = FLOOR_READ_KEYS[name];
    if (!accepted) {
      violations.push(`${emit.file}: ui:${name} has read bindings but the floor declares no read-key contract for it`);
      continue;
    }
    for (const key of Object.keys(emit.read)) {
      if (!accepted.includes(key)) {
        violations.push(`${emit.file}: ui:${name} binds read.${key}, but the leaf only reads {${accepted.join(", ")}}`);
      }
    }
  }

  assert.deepEqual(violations, [], `recipe/leaf contract mismatches:\n${violations.join("\n")}`);
});
