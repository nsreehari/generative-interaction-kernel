// GIK conformance runner.
// Validates every fixture against its message schema and through the envelope (oneOf),
// then asserts the golden reduction contract (event -> expected patch) as documented data.
//
// Run: npm install && npm run conformance

import Ajv from "ajv";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(join(here, p), "utf8"));const schemaFiles = [
  "manifest.schema.json",
  "document.schema.json",
  "patch.schema.json",
  "event.schema.json",
  "trace.schema.json",
  "envelope.schema.json",
];

const ajv = new Ajv({ allErrors: true, strict: false });
for (const f of schemaFiles) ajv.addSchema(readJson(f));

const byId = (name) => `https://genui.dev/gik/0.1/${name}`;

let failures = 0;
const check = (label, validate, data) => {
  const ok = validate(data);
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
    for (const e of validate.errors ?? []) {
      console.log(`        ${e.instancePath || "/"} ${e.message}`);
    }
  }
};

const vManifest = ajv.getSchema(byId("manifest.schema.json"));
const vDocument = ajv.getSchema(byId("document.schema.json"));
const vPatch = ajv.getSchema(byId("patch.schema.json"));
const vEvent = ajv.getSchema(byId("event.schema.json"));
const vEnvelope = ajv.getSchema(byId("envelope.schema.json"));

const manifest = readJson("fixtures/live-cards.manifest.json");
const document = readJson("fixtures/example.document.json");
const event = readJson("fixtures/example.event.json");
const expectedPatch = readJson("fixtures/expected.patch.json");

console.log("Per-message schema validation:");
check("manifest fixture -> manifest.schema", vManifest, manifest);
check("document fixture -> document.schema", vDocument, document);
check("event fixture    -> event.schema", vEvent, event);
check("patch fixture    -> patch.schema", vPatch, expectedPatch);

console.log("\nEnvelope (oneOf) validation:");
check("manifest -> envelope", vEnvelope, manifest);
check("document -> envelope", vEnvelope, document);
check("event    -> envelope", vEnvelope, event);
check("patch    -> envelope", vEnvelope, expectedPatch);

// Golden reduction contract: the event on `table-orders` (rowSelect) resolves the node's
// on.rowSelect assign edge, writing $event.id into card_data.selected. Any conforming kernel
// MUST produce exactly `expected.patch.json`. Reducer implementation is future work; here we
// assert the fixture is internally consistent with the document's declared behavior edge.
console.log("\nGolden reduction contract:");
const node = document.payload.root.edges.children.find((n) => n.id === event.payload.node);
const actions = node?.edges?.on?.[event.payload.name] ?? [];
const assign = actions.find((a) => a.do === "assign");
const contractOk =
  assign &&
  assign.target === expectedPatch.payload.ops[0].path &&
  event.payload.payload.id === expectedPatch.payload.ops[0].value &&
  expectedPatch.payload.ops[0].op === "set";
if (contractOk) {
  console.log(`  PASS  event(${event.payload.name}) on ${event.payload.node} -> ${expectedPatch.payload.ops[0].path}`);
} else {
  failures++;
  console.log("  FAIL  event does not map to expected patch per the document's behavior edge");
}

// Behavioral conformance matrix: structural validation of every case file against the
// case schema. Execution of the cases against the reference kernel lives in
// kernel/test/conformance.test.ts (needs the TS runtime); here we gate their shape.
console.log("\nConformance matrix (case shape):");
const caseSchema = readJson("../conformance/conformance-case.schema.json");
const vCase = new Ajv({ allErrors: true, strict: false }).compile(caseSchema);
const casesDir = join(here, "../conformance/cases");
for (const f of readdirSync(casesDir).filter((n) => n.endsWith(".case.json")).sort()) {
  check(`case ${f}`, vCase, JSON.parse(readFileSync(join(casesDir, f), "utf8")));
}

console.log(`\n${failures === 0 ? "OK: all conformance checks passed." : `FAILED: ${failures} check(s).`}`);
process.exit(failures === 0 ? 0 : 1);
