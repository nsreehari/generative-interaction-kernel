# Vendored: JSONata (synchronous build)

`jsonata-sync.cjs` is an owned, in-repo copy of the JSONata engine — the same synchronous
browserified bundle used by `yaml-flow`'s `compute-jsonata` support. It is vendored here so the
TypeScript reference kernel has **no external `jsonata` npm dependency**: the full JSONata language
ships inside this repository (the C# kernel gets an independent native port of the same language).

- **Source project:** JSONata — https://github.com/jsonata-js/jsonata
- **License:** MIT © Copyright IBM Corp. 2018 (see the header inside `jsonata-sync.cjs`).
- **Shape:** a UMD/CommonJS bundle exposing `jsonataSync(expr)` → `{ evaluate(input, bindings?) }`,
  evaluated **synchronously** (no Promises), which is why `JsonataExpressionProvider` can resolve
  immediately.

Do not hand-edit the bundle. To refresh it, re-vendor from the upstream sync build.
