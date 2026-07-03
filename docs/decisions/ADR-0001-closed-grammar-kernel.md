# ADR-0001 — Closed-grammar kernel with provider-supplied vocabulary

**Status:** Accepted — 2026-07-03

## Context

The platform must let a developer declare "this is my DSL, this is my registry, etc." and provide
generative-UI machinery around those inputs. The central question is where the boundary between
the fixed platform and the pluggable inputs falls. An existing system already demonstrated a
"closed grammar vs open spec" split, where the grammar (how a node maps to a component, to data,
to children, to visibility) is universal while the per-component specifications are domain-specific.

## Decision

The **kernel fixes the universal node grammar** — the closed set of node/edge shapes
(`render`, `read`, `write`, `child`, `gate`, `behavior`) and the closed set of action families.
Everything domain-specific — which capabilities exist, what each spec means, which namespaces data
lives in, which expression language, which framework renders, which model authors — is supplied by
**providers**. A concrete platform = kernel + one implementation of each provider.

The existing DSL/registry/app is reframed as **one profile (one instantiation)**, not the platform.

## Alternatives considered

### A. Consumer-defined / pluggable grammar (parser-generator style)
The node grammar itself would be supplied by the consumer.
**Rejected because:** if the grammar is pluggable, there is nothing left for the platform to
standardize. The interpreter, the validator, and the tool-catalog generator all depend on a fixed
grammar; making it pluggable reduces the platform to "a library for writing UI frameworks." The
value is precisely in fixing the grammar and freeing the vocabulary.

### B. Standardize the existing DSL/app as the deliverable
**Rejected because:** it standardizes one implementation rather than exposing a reusable contract.
The existing system is retained as a profile (one instantiation, and the first to onboard) that
proves the pattern for one vocabulary.

## Consequences

- Documents are portable and interpreted identically across every platform instance.
- The interpreter, validator, and tool-generator are reusable and written once.
- Providers extend **vocabulary**, never **shape** — a durable constraint enforced by the grammar.
- A second, independent profile (different capabilities, model, and renderer) becomes the proof
  that the kernel is genuinely generic.
