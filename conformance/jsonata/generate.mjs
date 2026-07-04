// generate.mjs — fill/refresh the `expected` field of every JSONata corpus case by evaluating
// the expression against the CANONICAL vendored TS engine (kernel/src/vendor/jsonata.cjs).
//
// The vendored engine is the single source of truth: this script never hand-computes a value.
// Result semantics are provider-normalized — a JSONata `undefined` (no match) is stored as null,
// matching how JsonataExpressionProvider (and the C# port) consume results.
//
// Usage:
//   node conformance/jsonata/generate.mjs          # rewrites corpus.json with fresh expected values
//   node conformance/jsonata/generate.mjs --check   # exits non-zero if any expected is stale/missing

import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusPath = resolve(__dirname, "corpus.json");
const enginePath = resolve(__dirname, "../../kernel/src/vendor/jsonata.cjs");

const _require = createRequire(import.meta.url);
const jsonata = _require(enginePath);

const checkOnly = process.argv.includes("--check");

/** Normalize an engine result exactly as JsonataExpressionProvider does: undefined -> null. */
function normalize(v) {
  return v === undefined ? null : v;
}

/** Stable deep-equality via canonical JSON (object keys sorted). */
function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}

async function evalCase(c) {
  const compiled = jsonata(c.expr);
  const data = c.data ?? {};
  const bindings = c.bindings ?? {};
  const res = await compiled.evaluate(data, bindings);
  return normalize(res);
}

const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
let stale = 0;
let failed = 0;

for (const c of corpus.cases) {
  let actual;
  try {
    actual = await evalCase(c);
  } catch (err) {
    failed++;
    console.error(`ERROR  ${c.name}: ${c.expr}\n       ${err.message}`);
    continue;
  }
  if (checkOnly) {
    if (!("expected" in c) || canon(c.expected) !== canon(actual)) {
      stale++;
      console.error(`STALE  ${c.name}: ${c.expr}\n       have ${JSON.stringify(c.expected)} want ${JSON.stringify(actual)}`);
    }
  } else {
    c.expected = actual;
  }
}

if (failed > 0) {
  console.error(`\n${failed} case(s) threw during evaluation.`);
  process.exit(1);
}

if (checkOnly) {
  if (stale > 0) {
    console.error(`\n${stale} corpus case(s) are stale. Run: node conformance/jsonata/generate.mjs`);
    process.exit(1);
  }
  console.log(`OK: all ${corpus.cases.length} corpus expected values match the vendored engine.`);
} else {
  writeFileSync(corpusPath, JSON.stringify(corpus, null, 2) + "\n");
  console.log(`Wrote ${corpus.cases.length} expected values to corpus.json (source: canonical vendored engine).`);
}
