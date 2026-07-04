# GenUI.Jsonata — native C# port of the canonical JSONata language

This island is a from-scratch C# implementation of JSONata, ported **from the canonical JavaScript
source** (`kernel/src/vendor/jsonata.cjs`, JSONata v2.2.1 — the same engine the TypeScript kernel
runs). It exists so the C# kernel can own the full expression language with **zero external
dependencies**, matching the TS kernel's vendored engine feature-for-feature.

## Why canonical (not the Python port)

An existing Python port of JSONata is a port-of-a-port (JavaScript → jsonata-java → Python) and can
carry translation drift. To avoid inheriting that drift, this port is read directly from the
canonical JS implementation, and every module is measured against results produced by that same
canonical engine.

## The arbiter: one shared corpus

Correctness is not judged by reading code side by side — it is judged by the shared conformance
corpus at [`conformance/jsonata/corpus.json`](../../conformance/jsonata/corpus.json), whose
`expected` values are generated from the canonical vendored engine. The TS kernel is held to that
corpus (`npm run test:jsonata`); this C# port is held to the **same** corpus as the parser and
evaluator come online.

## Staged plan (module by module)

| Stage | Module | Status |
|-------|--------|--------|
| 1 | Tokenizer (lexer) | **done** — `Tokenizer.cs`, gated by `GenUI.Jsonata.TokenizerCheck` |
| 2 | Parser (Pratt / TDOP) → AST | not started |
| 3 | Evaluator (path semantics, sequences) | not started |
| 4 | Core function library (`$sum`, `$map`, string/number/array fns) | not started |
| 5 | Date/time + signature validation | not started |

Until stages 2–4 land, the kernel keeps using `MiniJsonataProvider` (the hand-written subset in
`GenUI.Kernel/Expression.cs`). The full port replaces it only once it reproduces the corpus.

## Fidelity notes

- `Tokenizer.cs` is a line-by-line port of the canonical `tokenizer`: same operators/escapes tables
  (`Operators.cs`), same double-character operators, same string/number/name scanning, same S01xx
  error codes (`JsonataException.cs`).
- `String.charAt` out-of-range returns `''` in JS; the port uses `'\0'` as that sentinel (JSONata
  source never contains NUL, and no canonical comparison matches `'\0'`).
- Regex literals compile to `System.Text.RegularExpressions.Regex` (i/m flags mapped; JSONata's
  implicit global 'g' is applied at match time). JS↔.NET regex dialect differences are a stage-4
  concern and are covered by corpus cases when regex functions are ported.

## Build / check

```
dotnet run --project kernel-dotnet/GenUI.Jsonata.TokenizerCheck   # stage-1 gate
```

Wired into the JS suite as `npm run test:dotnet-jsonata` (part of `npm test`).
