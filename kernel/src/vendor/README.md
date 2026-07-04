# Vendored: JSONata (canonical v2.2.1)

`jsonata.cjs` is an owned, in-repo copy of the **canonical** JSONata engine (version 2.2.1). It is
vendored here so the TypeScript reference kernel has **no external `jsonata` npm dependency**: the
full JSONata language ships inside this repository.

This is deliberately the **same canonical source that the C# port follows** (see
`kernel-dotnet/GenUI.Jsonata/`). Keeping both kernels on one canonical reference — rather than the
TS kernel on one build and the C# port on a port-of-a-port — is what makes cross-kernel expression
parity verifiable against a single shared conformance corpus.

- **Source project:** JSONata — https://github.com/jsonata-js/jsonata
- **Version:** 2.2.1 (un-minified, browserified UMD bundle; the concatenated `src/*.js` modules are
  readable inside the file — e.g. the tokenizer and parser — which is what the C# port is read from).
- **License:** MIT (see `jsonata.LICENSE`, and the header inside `jsonata.cjs`).
- **Shape:** a UMD/CommonJS bundle exposing `jsonata(expr)` → `{ evaluate(input, bindings?) }`,
  where `evaluate` returns a `Promise` (v2 semantics), so `JsonataExpressionProvider.eval` awaits it.

Do not hand-edit the bundle. To refresh it, re-copy `node_modules/jsonata/jsonata.js` at the pinned
version and update this note.
