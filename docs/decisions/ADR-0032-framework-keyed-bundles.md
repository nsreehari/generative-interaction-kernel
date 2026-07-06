# ADR-0032 — Framework-keyed bundles: `samples/bundles/` as a first-class sibling, apps compose them

**Status:** Proposed — 2026-07-07

## Context

ADR-0030 made the **Bundle** the unit of an application (`{ manifest, document, state?, effects?,
components? }`) and ADR-0031 scoped a bundle's registry to *shared floor + its own additive overlay*.
But two things are true of the code today that the "everything-is-JSON, runs on any renderer" thesis
outgrows:

1. **`components` is React-only.** [`adapters/react/src/primitives/bundle.ts`](../../adapters/react/src/primitives/bundle.ts)
   defines `Bundle.components?: Record<string, CapabilityView>` — a React view type — and there is
   **no bundle concept on the dotnet side at all**. A bundle that carries custom vocabulary therefore
   cannot honor the ADR-0029 two-renderer equivalence: its neutral JSON (`manifest`/`document`/`state`)
   is portable, but its *drawing* is bound to React.

2. **Bundles are not first-class artifacts.** Concrete bundles are authored as JSON *inside* each app
   (`apps/workbench/src/inspect.bundle.json`, `chrome.bundle.json`) and their views live in
   `apps/workbench/src/profile/registry` — buried per-app, not shareable or discoverable.

The neutral core of a bundle is genuinely framework-agnostic; only the *drawing* (and possibly the
*effects*) fork per framework. The structure should say so.

## Decision

**Promote bundles to a first-class `samples/bundles/` directory (sibling to `samples/apps/`), and make a
bundle's code side framework-keyed. An app is pure composition of bundles.**

- **`samples/bundles/` is a sibling to `samples/apps/`.** Both live under a top-level `samples/` tree.
  Each bundle is a self-contained directory owning its neutral JSON, its per-framework drawings, and its
  effects:

  ```
  samples/
    apps/                    # apps = pure composition of bundles (+ native cross-bundle bridges)
    bundles/
      inspect/
        manifest.json        # neutral: namespaces + extra-capability schemas (extraCapabilities)
        document.json        # neutral: the UI-intent tree
        state.json           # neutral: seed state for the declared namespaces
        components/
          react/             # CapabilityView<ReactNode>        drawings for the extra caps
          dotnet/            # CapabilityView<Element> (Reactor) drawings for the SAME caps
        effects/             # named Orchestrator handlers (per framework where they must differ)
  ```

- **The neutral trio is the portable contract.** `manifest` + `document` + `state` (the
  `SerializableBundle`) stay framework-agnostic and flow through *any* kernel/renderer, preserving
  ADR-0029 equivalence. One manifest declares the extra capability's schema once; each `components/<fw>`
  supplies that capability's drawing for its framework. This is ADR-0031's "manifest symmetry"
  generalized from one framework to N.

- **`components` becomes framework-keyed.** The bundle's code side is selected by the host's framework,
  not baked in: conceptually `components: { react?, dotnet? }` (each `Record<capability, view>` in that
  framework's view type). The React host overlays `components.react`; the Reactor host overlays
  `components.dotnet`. ADR-0031's per-bundle, additive, floor-inheriting scoping is unchanged — only the
  overlay is now chosen per framework.

- **The bundle owns the resolution namespace — there is no ambient "app namespace."** A bundle carries
  its own `manifest`, which declares its `namespaces`; `loadBundle` seeds a store from them and that
  bundle's kernel resolves every `read`/`write`/`gate` against **that** store. Per ADR-0030/0031 each
  mounted bundle is an isolated runtime (own kernel + own state). An **app is a composition/packaging
  concept**, not a namespace-owning runtime.

- **Apps compose bundles.** `samples/apps/*` shrink to composition + host wiring: they `embed` (or host)
  bundles from `samples/bundles/` and supply the *native cross-bundle bridges* where two isolated bundles
  must share (the existing "thin host wiring" of ADR-0030, e.g. the workbench `workbench`→guest→`inspect`
  seams). Cross-bundle sharing stays **explicit**, never ambient — a direct consequence of per-bundle
  namespace isolation.

## Alternatives considered

### A. Keep `components`/`effects` at the app level; bundles are only SerializableJSON
**Rejected because:** it contradicts ADR-0031's per-bundle scoping (a bundle must be hostable *anywhere*
carrying its own vocabulary) and ADR-0030's definition of a Bundle as *including* `effects`/`components`.
It also makes a bundle un-embeddable by reference across apps — the exact gap ADR-0030/0031 closed.

### B. Keep `components` React-only (status quo)
**Rejected because:** it strands custom-vocabulary bundles on React and breaks the ADR-0029 promise that
the same document renders equivalently on React and Reactor/WinUI. The neutral core is already portable;
only the drawing needs the per-framework fork.

### C. A single merged `components/` folder (framework detected by file/type)
**Rejected because:** the two frameworks have different view *types* (`CapabilityView<ReactNode>` vs
`CapabilityView<Element>`) and toolchains (TS/JSX vs C#/Reactor); an explicit `react/` + `dotnet/` split
keeps each buildable in its own project and makes "which capabilities are drawn on which framework"
inspectable at a glance.

### D. Leave bundles inside `apps/`
**Rejected because:** it keeps bundles undiscoverable and per-app-duplicated, and blurs the app =
*composition* boundary. A `samples/bundles/` sibling (alongside `samples/apps/`) makes reuse and
cross-app embedding first-class.

## Consequences

- **New surface on the `Bundle` type + a dotnet bundle host.** Making `components` framework-keyed means
  `adapters/react` learns to read `components.react` and a new `adapters/dotnet` bundle host learns to
  read `components.dotnet` (it does not exist yet). Both must stay in lockstep with the one neutral
  manifest. This is the main implementation cost.

- **A loader that composes the trio.** Today `bundleFromJson` consumes a single `{ manifest, document,
  state }` object; the split trio (`manifest.json`/`document.json`/`state.json`) is recombined at load.
  A thin loader reads the three files (plus the framework's `components/`) into a `Bundle` — no kernel or
  wire change.

- **Effects portability is a follow-up decision.** JSON and per-framework `components` make a bundle
  drawable anywhere; `effects` are native handlers (time/IO) and are only as portable as their
  per-framework implementations. Whether effects are neutral contracts with per-framework impls, or
  simply authored per host, is deferred (tracked in `not-yet-decided.md`).

- **Migration is mechanical and staged.** Extract each app-embedded bundle into `samples/bundles/<name>/`
  (neutral trio first — already done for `inspect` as a non-wired scaffold), then move the React views
  under `components/react/`, add `components/dotnet/` when the Reactor drawings are authored, and finally
  repoint the app to compose from `samples/bundles/`. Relocating the live `apps/` tree to `samples/apps/`
  is its own wiring step (vite/tsconfig/import/package-script updates) and is intentionally deferred from
  this scaffold. No kernel grammar, provider contract, or wire message changes — this is an
  adapter/packaging-layer decision, like ADR-0030/0031.

- **Scaffold status.** `samples/bundles/inspect/` exists as a **non-wired proposal**: the neutral trio is
  extracted faithfully from `apps/workbench/src/inspect.bundle.json`; `components/{react,dotnet}` and
  `effects/` are placeholders. The live workbench still loads its in-app bundle unchanged, and `apps/` has
  not yet been physically moved under `samples/`.

## Follow-up (2026-07-07): collapse to one generic host; console & workbench become bundles

"Apps are pure composition" taken to its conclusion means there is **one app** — the generic host — and
everything else is a bundle it mounts. ADR-0030's "no privileged shell" already asserts this; the
current two Vite deployables (`apps/console`, `apps/workbench`) are the residue to collapse.

**Assessment of the two current apps:**

- **`console` is already the host.** [`Console.tsx`](../../apps/console/src/Console.tsx) is essentially
  `<BundleHost bundle={consoleBundle} apps={appRegistry} />`; its content already lives in
  `console.bundle.json` (+ `consoleEffects`). The only "app" part is the thin Vite bootstrap and the
  `AppRegistry` it publishes for `embed`-by-name.
- **`workbench` is a composition + native bridges.** [`Workbench.tsx`](../../apps/workbench/src/Workbench.tsx)
  mounts the `chrome` and `inspect` bundles around a guest playground runtime, wired by three imperative
  seams — bridge A (chrome→guest: run the Interaction→Presentation→UI compiler, forward event-bar fires),
  bridge B (guest→inspect: stream artifacts), bridge C (chrome state). Per ADR-0030 these are
  *irreducibly native* (a compiler run + cross-kernel event forwarding), so the workbench cannot be a
  pure `SerializableBundle`; it is a **bundle-composition with a native side**.

**Decision (extends this ADR):** extract a single generic **host app** and demote both console and
workbench to bundles it mounts. Neither is privileged; the host is the only `samples/apps/` entry.

**Staged migration (each stage independently shippable, kernel/protocol untouched):**

1. **Extract the host.** Generalize the console bootstrap into `samples/apps/host` — a Vite entry that
   renders `BundleHost` for a bundle selected by config/route, publishing the shared `AppRegistry`. (Low
   risk: it is the console's existing shape, parameterized.)
2. **Console → bundle.** Move `console.bundle.json` + `consoleEffects` into `samples/bundles/console/`
   (neutral trio + `effects/`). The host mounts it as the default. The `apps/console` package disappears.
   (Low risk: console is already bundle-shaped.)
3. **Workbench → bundle-composition.** Move `chrome.bundle.json`/`inspect.bundle.json` +
   `workbenchComponents` into `samples/bundles/{workbench-chrome,inspect}/`, and package the three
   bridges as the composition's **native `effects`/host wiring** (they stay code, by ADR-0030). The host
   mounts the workbench composition by name. (Higher risk: touches the actively-edited workbench and its
   native seams — do last, coordinated, with a full rebuild + both dev servers verified.)
4. **Retire `apps/`.** Once both are bundles under `samples/bundles/` and the host lives in
   `samples/apps/host`, delete the old `apps/console` and `apps/workbench` packages and repoint the
   `dev`/`build`/`typecheck` scripts at the single host.

**Risks / guardrails:** the workbench is under concurrent human editing and carries the only native
cross-kernel seams — its migration (stage 3) is the one destructive step and must be explicitly
sequenced, not folded into the low-risk stages 1–2. Stages 1–2 (host + console) can proceed
independently and leave the workbench running unchanged.
