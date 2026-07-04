# Shared JSONata conformance corpus

This corpus is the **behavioral arbiter** for JSONata across both kernels. It pins expression →
result behavior so the TypeScript kernel and the C# native port (`kernel-dotnet/GenUI.Jsonata/`,
in progress) provably agree, and so neither drifts from the canonical language.

## Files

- `corpus.json` — the cases. Each case is `{ name, expr, data?, bindings?, expected }`.
- `generate.mjs` — evaluates every `expr` against the **canonical vendored engine**
  (`kernel/src/vendor/jsonata.cjs`, JSONata v2.2.1) and either writes `expected` (default) or
  verifies it (`--check`).

## Source of truth

`expected` values are **never hand-authored**. They are generated from the vendored canonical
JSONata engine — the same engine the TS kernel runs at runtime. This is the concrete meaning of
"refer to the canonical implementation": the canonical engine *defines* the expected results, and
every port is measured against them.

Result semantics are **provider-normalized**: a JSONata `undefined` (no match) is recorded as
`null`, mirroring how `JsonataExpressionProvider` (and the forthcoming C# provider) hand results to
the kernel.

## Commands

```
npm run test:jsonata     # verify corpus expected == vendored engine (part of `npm test`)
npm run jsonata:regen    # regenerate expected after adding/editing cases
```

## Roles

- **TS engine** — `test:jsonata` confirms the vendored engine reproduces the corpus (regression
  guard on the vendored bundle and on new cases).
- **C# port** — `kernel-dotnet/GenUI.Jsonata/` consumes this **same** `corpus.json` and reproduces
  every `expected` (90/90). It now backs the kernel via `JsonataExpressionProvider`, having replaced
  the retired `MiniJsonataProvider`.

When adding language coverage, add cases here first, run `jsonata:regen`, and both kernels are then
held to the new behavior.
