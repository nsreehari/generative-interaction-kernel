# Vendored: JSONata (canonical v2.2.1)

`jsonata.cjs` is an owned, in-repo copy of the **canonical** JSONata engine (version 2.2.1). It is
vendored here so the TypeScript reference kernel has **no external `jsonata` npm dependency**: the
full JSONata language ships inside this repository.

Pinning the **canonical** source (rather than a build-specific or port-of-a-port copy) keeps the
expression engine verifiable against a single shared conformance corpus, and lets any future
re-implementation follow the same reference.

- **Source project:** JSONata — https://github.com/jsonata-js/jsonata
- **Version:** 2.2.1 (un-minified, browserified UMD bundle; the concatenated `src/*.js` modules are
  readable inside the file — e.g. the tokenizer and parser).
- **License:** MIT (see `jsonata.LICENSE`, and the header inside `jsonata.cjs`).
- **Shape:** a UMD/CommonJS bundle exposing `jsonata(expr)` → `{ evaluate(input, bindings?) }`,
  where `evaluate` returns a `Promise` (v2 semantics), so `JsonataExpressionProvider.eval` awaits it.

Do not hand-edit the bundle. To refresh it, re-copy `node_modules/jsonata/jsonata.js` at the pinned
version and update this note.
