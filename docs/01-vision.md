# 01 — Vision

## The problem

Generative UI — where an agent/LLM produces the interface, not just text — keeps getting
rebuilt from scratch per product. Each implementation hardcodes its own component set, its own
data-binding rules, its own validation, its own agent-orchestration glue, and its own transport.
The *machinery* is nearly identical every time; only the **vocabulary** (which components, what
data, which model, which framework) differs.

## The goal

Build a **generic platform layer**: a kernel that provides the reusable generative-UI machinery,
and takes the domain- and framework-specific parts as **declarative, pluggable providers**.

A developer instantiates a concrete platform by declaring:

> "This is my DSL (component/spec grammar). This is my registry (component set). This is my data
> model, my expression language, my renderer, my orchestrator, my transport."

…and the platform supplies the interpreter, the validator, the reducer, the tool-shape
generator, the fallback semantics, and the observability — uniformly, for any such declaration.

## The pivot that defined the scope

This project began as a narrower question — *"generalize an existing component registry"* — and
evolved through several reframings:

1. Generalize a single React registry into a reusable generative-UI component.
2. Assess whether an existing three-repo system was a viable "GenUI platform."
3. Enumerate what such a system already **has** vs where the **gaps** are.
4. Begin standardizing that system's DSL (its JSON Schema).
5. **Pivot (decisive):** the goal is **not** to standardize the existing DSL/code. The goal is a
   **platform** where the DSL, the registry, and the rest are *declarative inputs*. The existing
   system becomes **one reference profile**, not the target.
6. Zoom out fully: design the platform layer as **domain- and framework-neutral**.

The existing system is valuable precisely because it *proves the pattern for one vocabulary* —
it already contains every ingredient (a schema-driven DSL, a registry, an interpreter, a
validation engine, an orchestration layer, a streaming transport). The platform **generalizes
those ingredients into contracts** and lets them be supplied, rather than baked in.

## What the platform provides vs what it takes

| Kernel provides (fixed) | Integrator supplies (declared) |
|---|---|
| Node/edge grammar + interpreter | Capability vocabulary + schemas |
| Pure reducer (behavior + machines) | Namespaces + expression language |
| Validation harness | Render adapter (framework binding) |
| Resolution order + fallback | Orchestrator (LLM / back end) |
| Tool-shape generation | Transport / storage adapter |
| Observability fan-out | — |

## Motivating capability gaps (why a platform, not another app)

The assessment of the inspiring system surfaced recurring gaps that a *platform* should solve
once, generically, rather than each app re-solving:

- **Progressive generative streaming** — streaming *state* is common; streaming *generation*
  (partial documents materializing as they are produced) is rare and belongs in the kernel/transport.
- **Observability / tracing** — per-node resolve/fallback/action/transition telemetry is almost
  always missing; the kernel should emit it uniformly.
- **Human-in-the-loop approval** — a declarative confirmation gate before consequential actions.
- **Render-boundary safety** — graceful fallback and error isolation for unknown/failed nodes.
- **Open extension surface** — capability/plugin discovery instead of a closed, edited-in-code set.

These are recorded as motivation, not as a backlog for any existing product.

## Non-goals

- Standardizing or refactoring any existing DSL/app as the primary deliverable.
- Building a UI framework. Framework bindings are providers.
- Owning durable/long-running execution in the kernel (delegated to the Orchestrator provider).

Continue to [02-architecture.md](02-architecture.md).
