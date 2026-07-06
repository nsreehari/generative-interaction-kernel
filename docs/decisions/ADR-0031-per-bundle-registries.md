# ADR-0031 — Per-bundle capability registries: shared floor + additive overlay

**Status:** Accepted — 2026-07-06

## Context

A bundle (ADR-0030) renders through a `ComponentRegistry` — a `capability → React view` map with a
fallback. The shared **floor** registry supplies the universal primitive vocabulary
(`screen/row/panel/text/list/button/embed/…`); every bundle draws from it, which is what keeps
"one shared vocabulary, apps are data" true.

But some apps genuinely need specialized controls that are *not*, and should not become, floor
primitives — for example the workbench chrome's event bar and region editors. Embedding such an app
requires a registry that carries those extra views, yet `BundleHost` and the `embed` leaf hardcoded
the floor registry. So a custom-vocabulary app could not be hosted anywhere — the blocker for the
ADR-0030 workbench reshaping.

The question was the *shape* of a bundle's registry: does a bundle get a **completely custom
component pool**, or the **central floor plus a small custom overlay**?

## Decision

**A bundle's registry is the shared floor plus a per-bundle additive overlay — not a fully custom
pool.**

- A `Bundle` may carry `components?: Record<capability, CapabilityView>` (code-side, like
  `effects`). The effective registry is `overlayRegistry(primitiveRegistry, bundle.components)`:
  `get(cap) = extra[cap] ?? base.get(cap)`, with the base's `fallback` preserved. An extra **wins**
  on key collision; the floor fills in everything else.
- Applied at **both** render sites: `BundleHost` (the root) and the `embed` leaf (for a resolved
  named app). Inline `SerializableBundle`s (JSON from state) have no `components` and render on the
  floor only.
- **Scope is per-bundle.** Each bundle's overlay is `floor ⊕ its own extras`; a nested bundle does
  **not** inherit the parent app's custom vocabulary, only the floor. Custom vocabularies stay local
  while the floor stays universal.
- **Manifest symmetry.** `bundleManifest({ extraCapabilities })` declares the extra vocabulary
  schema-side (props/emits, for validation); `components` provides the drawing. A custom capability
  is therefore declared in two aligned places.

## Alternatives considered

- **A completely custom component pool per registry.** Every app re-registers the primitives,
  duplicating the floor and letting it drift, and it breaks `embed` composition — a nested bundle
  that mixes floor primitives with its own controls would have no common base to fall back to.
  Rejected: the "one shared vocabulary" thesis (ADR-0001's closed grammar, realized in the adapter's
  floor) depends on the primitives being universal.
- **A parent/fallback registry chain** (resolve own → parent → … → fallback). More machinery than
  the need warrants; the `ComponentRegistry.get` shape makes a flat `extra[c] ?? base.get(c)`
  overlay sufficient, and a single overlay level matches the actual requirement (floor + one app
  delta).
- **Freeze the floor — forbid overriding a floor capability (collision = error).** Cleaner
  governance, but it removes a legitimate escape hatch (an app specializing, say, a richer `table`).
  Kept override with extras-winning, treated as a deliberate, rare choice rather than the norm.

## Consequences

- Custom-vocabulary apps (the workbench chrome/inspect) can be hosted anywhere via `embed`,
  unblocking the ADR-0030 workbench reshaping into two bundles.
- Most apps ship no `components` and are unaffected; the overlay path is inert until a bundle opts
  in — verified by the console (which ships no extras) rendering unchanged.
- An extra capability must be declared twice (manifest `extraCapabilities` + `components`); a future
  lint could enforce the pairing. Overriding a floor capability is possible but discouraged.
- Adapter-layer only: the kernel grammar, providers, and wire protocol are untouched.
