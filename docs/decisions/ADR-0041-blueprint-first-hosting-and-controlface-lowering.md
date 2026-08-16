# ADR-0041 — Blueprint-first application hosting; ControlFace owns runtime opening

**Status:** Accepted — 2026-07-20; amended 2026-07-20

## Context

ADR-0016 established one kernel below a stack of lowering stages, and ADR-0038 made Profiles and
lowering recipes first-class declarative artifacts. ADR-0037 placed the callable platform boundary
in `face/`. However, the sample application host still selected and ran checked-in Bundles directly:
a top-level application was represented by a copied `manifest` + `document` + `state` trio, while a
Profile capable of lowering to the same document existed beside it.

That produced two competing application paths:

1. author a Blueprint/Profile and execute its lowering only in tests or authoring tools;
2. hand-maintain a parallel Bundle and run that Bundle in production.

Equality tests could detect drift between those paths, but could not make either one authoritative.
They also required derived runtime artifacts to remain committed, duplicated service/runtime
metadata, and encouraged product code to assemble its own Bundle. The URL and host registry exposed
`bundle=<id>` as the application identity even when the intended product identity was a Blueprint.

ADR-0030 deliberately made Bundle the application unit before declarative Profiles existed. This ADR
refines that decision now that the higher-level authored contract is available.

## Decision

### Blueprint is the application-level identity

A host opens a **Blueprint**, represented by its resolved Profile and lowering recipes. The Blueprint
is the single authored authority for:

- application identity and revision;
- semantic layers and lowering chain;
- declarative resources and service declarations;
- the non-derived runtime envelope (namespaces, contexts, actions, capabilities, external
  requirements, and initial state).

The terminal lowering stage produces the kernel `DocumentPayload`. The platform combines that result
with the Blueprint's runtime declaration and service declarations to create an in-memory runtime
definition. The kernel still receives exactly one manifest, one document, and one state model; this
decision changes how those inputs are obtained, not the kernel grammar or protocol.

Application selection therefore uses Blueprint identity through the single canonical short selector
(for example, `b=portfolio-tracker-new`). During migration the application host may parse the legacy
`bundle` query key, but it immediately canonicalizes that input to `b`; generated links, persisted
navigation, and documentation use only `b`. The host does not interpret the value as a Bundle
identity. The former `manage-bundles` inspection surface was retired rather than becoming a second
top-level hosting path.

### ControlFace owns opening and lowering lifecycle

The trusted public operation is `ControlFace.openBlueprint`:

1. resolve the requested Blueprint through a host-supplied resolver;
2. verify that the resolved identity matches the requested identity;
3. execute the Blueprint's declared lowering chain through the Profile engine;
4. derive the runtime manifest from the Profile runtime declaration and Blueprint-owned services;
5. return the runtime definition required by an adapter to construct the live kernel.

The Profile package owns the pure, generic lowering machinery. ControlFace owns the privileged
control-plane operation and lifecycle around that machinery. This preserves the architecture:

```text
Blueprint/Profile -> ControlFace.openBlueprint -> Profile lowering -> runtime definition -> Kernel
```

`openBlueprint` is a static pre-runtime operation on `ControlFace`: a live `ControlFace` instance
requires a manifest and terminal document and therefore cannot exist until opening has completed.
There is no separate `BlueprintFace`; Blueprint lifecycle is part of the control-plane Face rather
than a new policy/audience axis.

### Host and product ownership

The **host** supplies environment policy and trusted implementations:

- Blueprint resolution;
- allowed capability, projection, effect, and service implementations;
- credentials, endpoint authorization, and service-kind factories;
- the render adapter and transport composition.

The host does not import a product-specific compiler, hand-assemble a product Bundle, or duplicate
runtime declarations. It asks ControlFace to open a Blueprint and renders the returned runtime.

A **product Blueprint** owns domain declarations, lowering data, initial state, service uses, and any
irreducibly native domain implementations. It does not implement `makeBundle`, host registry logic,
or generic runtime assembly.

### Bundle remains a lower-level runtime/composition unit

Bundles remain valid for the concerns established by ADR-0030 and ADR-0031:

- adapter-level packaging of a runnable manifest/document/state plus native implementations;
- embedding an already-resolved runtime as a nested isolated kernel;
- reusable low-level or framework-specific runtime dependencies;
- direct diagnostics and migration of existing Bundle-authored samples.

A Bundle is no longer the authoritative authored representation of a top-level product when a
Blueprint exists. The adapter may internally materialize the in-memory runtime definition into its
Bundle type; that is an implementation detail after Blueprint opening, not a second source of truth.

### Derived runtime artifacts are not committed

A manifest, terminal document, or state file derived from a Blueprint must not be checked in merely
to make the application hostable. Derived runtime values are created in memory when the Blueprint
is opened. Tests exercise the same opening path used by the application.

If a future deployment requires serialized or cached runtime output, it must be explicitly treated
as disposable build/cache output with provenance back to the Blueprint revision. It cannot become a
second authored surface and must not be committed beside its source.

## Alternatives considered

### A. Keep checked-in Bundle artifacts synchronized with Profiles

Rejected because equality tests preserve two authorities instead of removing duplication. Every
runtime change must be made twice, and the production host bypasses the authored lowering path.

### B. Generate and commit Bundle JSON during the build

Rejected because committing generated output still expands the review and maintenance surface and
allows callers to depend on the derivative rather than the Blueprint. Build caches may exist outside
the authored source tree, but they are not platform contracts.

### C. Add a product-specific `makeBundle()`

Rejected because it relocates generic platform assembly into each product. Product code would again
own manifest construction, state packaging, native extension attachment, and service wiring.

### D. Make the React/app host execute lowering directly

Rejected because lowering and identity validation are privileged platform lifecycle operations, not
render-adapter responsibilities. It would also force every host technology to reproduce the same
logic.

### E. Introduce a separate `BlueprintFace`

Rejected because Blueprint opening is a control-plane lifecycle operation, not a separate audience
or policy projection. A second Face would obscure the single `kernel -> face -> projection ->
transport -> host` boundary established by ADR-0037.

### F. Implicitly treat every Bundle id as a Blueprint

Rejected because it erases the distinction between authored application identity and low-level
runtime packaging. The application catalog contains only Blueprint identities; Bundle discovery
belongs to the Bundle manager.

## Consequences

- ADR-0030 is superseded only where it says that Bundle is the authoritative unit of a top-level
  application or that hosting an application is always mounting an authored Bundle. Its Bundle
  shape, adapter loading, isolation, and `embed` composition decisions remain valid.
- The Profile contract carries a declarative runtime envelope and initial state; Profile-owned
  service declarations are merged into the runtime manifest by ControlFace.
- `openBlueprint` does not make profile-specific hard-coded compilers an accepted authoring model.
  Per ADR-0038, product mappings encoded in TypeScript remain migration residue and must move into
  declarative lowering-recipe data; only generic recipe executors belong in the platform runtime.
- `ControlFace.openBlueprint` becomes the one application-opening control-plane path. AgentFace does
  not receive this authority unless a future projection explicitly and safely exposes a subset.
- Application hosts select Blueprints explicitly and render the returned runtime. Adapter-internal
  Bundle materialization does not change the application identity.
- Compatibility parsing of a legacy `bundle=<blueprint-id>` URL is allowed only as an input migration
  aid and must canonicalize to `b=<blueprint-id>`; it does not restore Bundle-first hosting.
- Existing Bundle-first applications migrate incrementally. During migration, direct Bundle hosting
  is legacy/low-level behavior, not a second recommended application model.
- Tests open the Blueprint through ControlFace and exercise the resulting runtime; synchronization
  tests against copied runtime JSON are removed.
- The kernel, closed action grammar, wire messages, and renderer protocol are unchanged.

## Amendment (2026-07-29): hosts consume portable materializations

ADR-0046 makes Blueprint preparation an explicit `@gik/blueprint` operation. Public React hosting
materializes an authored Blueprint plus immutable external context once and reuses the portable
value for transitions. Stateless hosts may persist the same value. Host adapters do not implement
recipe lowering, and generated terminal output remains derived data rather than a second authored
surface. This applies to `@gik/react`; the former compatibility package has been removed.
