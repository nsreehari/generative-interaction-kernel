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
const schemas = join(here, "../packages/evaluators/schemas");
const readJson = (p) => JSON.parse(readFileSync(join(here, p), "utf8"));
const readSchema = (p) => JSON.parse(readFileSync(join(schemas, p), "utf8"));
const schemaFiles = [
  "vocabulary.schema.json",
  "program.schema.json",
  "patch.schema.json",
  "progress.schema.json",
  "event.schema.json",
  "trace.schema.json",
  "envelope.schema.json",
];

const ajv = new Ajv({ allErrors: true, strict: false });
for (const f of schemaFiles) ajv.addSchema(readSchema(f));

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

const reject = (label, validate, data) => {
  if (!validate(data)) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
};

const vVocabulary = ajv.getSchema(byId("vocabulary.schema.json"));
const vProgram = ajv.getSchema(byId("program.schema.json"));
const vPatch = ajv.getSchema(byId("patch.schema.json"));
const vProgress = ajv.getSchema(byId("progress.schema.json"));
const vEvent = ajv.getSchema(byId("event.schema.json"));
const vEnvelope = ajv.getSchema(byId("envelope.schema.json"));

const vocabulary = readJson("fixtures/live-cards.vocabulary.json");
const program = readJson("fixtures/example.program.json");
const event = readJson("fixtures/example.event.json");
const expectedPatch = readJson("fixtures/expected.patch.json");
const progress = readJson("fixtures/example.progress.json");

console.log("Per-message schema validation:");
check("vocabulary fixture -> vocabulary.schema", vVocabulary, vocabulary);
check("program fixture    -> program.schema", vProgram, program);
check("event fixture    -> event.schema", vEvent, event);
check("patch fixture    -> patch.schema", vPatch, expectedPatch);
check("program patch    -> patch.schema", vPatch, {
  gik: "0.1",
  type: "patch",
  payload: {
    rev: 1,
    ops: [],
    program: [{ op: "setRoot", root: { capability: "panel", id: "root" } }],
  },
});
reject("malformed program patch rejected", vPatch, {
  gik: "0.1",
  type: "patch",
  payload: { rev: 1, ops: [], program: [{ op: "setRoot" }] },
});
check("progress fixture -> progress.schema", vProgress, progress);

console.log("\nEnvelope (oneOf) validation:");
check("vocabulary -> envelope", vEnvelope, vocabulary);
check("program    -> envelope", vEnvelope, program);
check("event    -> envelope", vEnvelope, event);
check("patch    -> envelope", vEnvelope, expectedPatch);
check("progress -> envelope", vEnvelope, progress);

// Golden reduction contract: the event on `table-orders` (rowSelect) resolves the node's
// on.rowSelect assign edge, writing $event.id into card_data.selected. Any conforming kernel
// MUST produce exactly `expected.patch.json`. Reducer implementation is future work; here we
// assert the fixture is internally consistent with the document's declared behavior edge.
console.log("\nGolden reduction contract:");
const node = program.payload.root.edges.children.find((n) => n.id === event.payload.node);
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
  console.log("  FAIL  event does not map to expected patch per the program's behavior edge");
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

console.log("\nDeclarative Blueprint tests (case shape):");
const blueprintCaseSchema = readSchema("blueprint-test-case.schema.json");
const vBlueprintCase = new Ajv({ allErrors: true, strict: false }).compile(blueprintCaseSchema);
const blueprintsDir = join(here, "../samples/blueprints");
const blueprintCaseFiles = readdirSync(blueprintsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => readdirSync(join(blueprintsDir, entry.name))
    .filter((name) => name.endsWith(".case.json"))
    .map((name) => ({ blueprintId: entry.name, name })));
for (const { blueprintId, name } of blueprintCaseFiles.sort((left, right) => left.blueprintId.localeCompare(right.blueprintId))) {
  check(
    `Blueprint case ${blueprintId}/${name}`,
    vBlueprintCase,
    JSON.parse(readFileSync(join(blueprintsDir, blueprintId, name), "utf8")),
  );
}

console.log(`\n${failures === 0 ? "OK: all conformance checks passed." : `FAILED: ${failures} check(s).`}`);
process.exit(failures === 0 ? 0 : 1);
