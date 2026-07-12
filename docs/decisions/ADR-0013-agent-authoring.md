# ADR-0013: Agent-authoring path — typed builders, validate-before-commit, lint over throw

**Status:** Accepted

## Context

The point of a *generic* GenUI platform is that an agent (or any producer) emits GIK documents from a
manifest's declared vocabulary — it does not hand-write schema-shaped JSON. Everything below the
authoring layer already exists: a closed grammar ([ADR-0002](ADR-0002-closed-grammar.md)), structural
validate-before-commit ([ADR-0005](ADR-0005-validation.md)), and graceful runtime fallback for
unknown capabilities. What was missing was an ergonomic, typed way to *produce* a document and a clear
contract for how much safety the producer gets before and after commit.

## Decision

Add a thin **authoring module** (`kernel/src/authoring.ts`) with three parts:

- **Typed constructors for the closed grammar.** `node(capability, id, opts)`, `document(root, opts)`,
  and one constructor per action family (`assign`, `assignFrom`, `derive`, `emit`, `invoke`,
  `navigate`, `confirm`, plus `guarded(...)`). These emit exactly the closed grammar — no new node
  kinds, no escape hatch — and omit empty edges so the output stays schema-clean. Vocabulary
  (capabilities, namespaces, events) stays open and manifest-supplied; the *grammar* stays closed.
- **`authorDocument(root, opts)` = validate-before-commit.** It envelopes the document and runs the
  normative schema validation, throwing `ValidationError` on a structurally malformed document
  (e.g. an action missing `do`). This is the same gate the kernel applies at construction, made
  available at authoring time so producers fail fast.
- **`lintManifestReferences(manifest, doc)` = warnings, not errors.** A separate, **non-throwing**
  pass that flags references which are structurally valid but not backed by the manifest:
  `unknown-capability`, `undeclared-event` (an `on` handler for an event a capability's `emits`
  doesn't list), and `undeclared-namespace`. It returns a list of warnings the producer can surface
  or ignore.

The split is the key decision: **structure is enforced (throw); references are advised (lint).**

## Alternatives considered

- **Reject unknown capabilities as hard errors.** Rejected: unknown capabilities are *safe* at runtime
  — the interpreter resolves them to a fallback node (`fallback = !registry.has(cap)`), so a renderer
  shows a graceful placeholder instead of crashing. Making them fatal would break forward-compatibility
  (an agent may target a capability a given renderer hasn't shipped yet) and contradict the fallback
  design. They belong in lint.
- **Fold reference checks into schema validation.** Rejected: the schema is about *structure* and is
  vocabulary-agnostic by design (`do` is "a built-in family or a manifest-declared custom action").
  Reference correctness is manifest-relative and advisory; conflating the two would make the schema
  manifest-specific and turn safe forward-references into hard failures.
- **A DSL / template language for authoring.** Rejected as premature: plain typed functions over the
  closed grammar give agents (and their type-checkers) everything needed without inventing a second
  surface to learn, validate, and version.
- **Let agents write raw JSON only.** Rejected: it is error-prone and gives no compile-time help;
  the constructors make the closed grammar the path of least resistance.

## Consequences

- Agents compose documents with type-checked builders, get a fail-fast structural gate, and a
  separate, non-fatal lint for semantic reference issues — all verified headlessly: an authored
  live-cards document validates, lints clean, and renders/round-trips over the wire; an unknown
  capability validates, is flagged by lint, and renders as a fallback node without crashing; a
  malformed document throws; and undeclared events/namespaces are reported as warnings.
- The closed grammar is preserved: the builders cannot express anything outside the six edges and six
  action families.
- Open surface: richer authoring aids (props-schema validation per capability at author time, quick-fix
  suggestions from lint) can layer on top without changing this contract.
