# Second kernel — C# (`kernel-dotnet/`)

An independent, spec-conformant reimplementation of the GenUI kernel in C#, proving the
platform's core premise: the behavioral contract lives in the **protocol + conformance matrix**
([ADR-0004](../docs/decisions/ADR-0004-protocol-over-sdk.md),
[ADR-0015](../docs/decisions/ADR-0015-conformance-matrix.md)), not in one SDK. This kernel passes
the **same** `conformance/cases/*.case.json` as the TypeScript reference, so identical expected
patches across both runners *is* reducer equivalence.

It is written against the language-neutral **runner contract**
([conformance/README.md](../conformance/README.md),
[ADR-0023](../docs/decisions/ADR-0023-conformance-runner-portability.md)).

## Layout

```
kernel-dotnet/
  GenUI.Kernel/               ← the kernel library (System.Text.Json only; no external packages)
    Json.cs                     ← namespaced store paths, set/merge/remove ops, deep-equal, truthy, unwrap
    Types.cs                    ← PatchOp, Patch, GupEvent, ResolvedNode, Effect
    Providers.cs                ← InMemoryStateModel, ManifestRegistry, IExpressionProvider
    Expression.cs               ← MiniJsonataProvider (the JSONata subset the matrix uses)
    Interpret.cs                ← Resolve: gate → capability → props(read) → children
    Reduce.cs                   ← the pure reducer: 6 action families, machines, emit cascade
    Validate.cs                 ← validate-before-commit (structural, mirrors document.schema.json)
    Kernel.cs                   ← Init / Dispatch / Resolve; one dispatch = one patch = one rev
  GenUI.Conformance/          ← the runner: executes every case, asserts patches + resolved tree
    Program.cs
```

## Run

```
dotnet run --project GenUI.Conformance      # from kernel-dotnet/
# or, from the platform root:
npm run test:dotnet
```

## Scope & fidelity notes

- **Expression provider.** `MiniJsonataProvider` implements exactly the JSONata forms the matrix
  exercises (path navigation, `$event`, `*`, `=`, `!=`, literals) with `truthy()`-wrapped results
  matching jsonata-js as observed through the contract. It is *not* a full JSONata engine; a richer
  case should swap in a full JSONata port behind `IExpressionProvider`.
- **No Orchestrator.** Like the reference conformance path, deferred effects
  (`invoke`/`confirm`/`navigate`) cross the Orchestrator seam and produce no store op here.
- **Zero NuGet dependencies.** Uses only `System.Text.Json` from the shared framework, so it builds
  and runs offline.
