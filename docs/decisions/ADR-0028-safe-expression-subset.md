# ADR-0028: Safe expression subset — a provider capability, mandated-safe by default for predicates

**Status:** Accepted

## Context

JSONata is the reference default `ExpressionProvider`
([ADR-0007](ADR-0007-reference-kernel-implementation.md)), and the platform now owns the *full*
language in both kernels ([ADR-0027](ADR-0027-own-jsonata-engine.md)). That full surface includes
constructs that are a code-injection / denial-of-service risk when the expression is authored by an
LLM agent and evaluated against untrusted runtime data:

- `$eval(...)` — dynamic evaluation of a string as an expression;
- function definitions (`function($x){ ... }`, `λ`) — user-defined and potentially recursive lambdas;
- `transform` (`~> | pattern | update | delete |`) — structural rewrites.

The open question ([not-yet-decided](../not-yet-decided.md), item 1) was whether a smaller sandboxed
subset should be *mandated* for agent-authored guards/gates, or whether we simply rely on the
provider seam per profile.

Not every expression position carries the same risk. The kernel evaluates expressions in two kinds
of position:

- **Predicate positions — adversarial.** Visibility gates (`edges.gate` in `interpret.ts` /
  `Interpret.cs`) and guards (action `guard` and machine-transition `guard` in `reduce.ts` /
  `Reduce.cs`). These are boolean predicates over state + event bindings. They have **no legitimate
  need** for `$eval`, lambdas, or `transform`, so restricting them loses no expressiveness while
  removing the injection/DoS surface.
- **Value positions — trusted.** `derive` (`args.expr`) and `assign` from a binding (`args.from`).
  These may legitimately want richer expressions and are treated as profile-authored.

## Decision

**Enforcement of the safe subset is a *provider capability*, not a kernel-hardcoded rule; the
platform *defaults* predicate positions to the safe subset, and profiles may widen it through the
existing seam.**

Concretely:

1. **The safe subset is a compile-time provider mode.** `JsonataExpressionProvider` gains a `safe`
   option (TS: `new JsonataExpressionProvider({ safe: true })`; C#:
   `new JsonataExpressionProvider(safe: true)`, backed by `JsonataEngine.CompileSafe`). In safe mode
   the provider walks the *parsed AST* at compile time and rejects `$eval`, `lambda`, and `transform`
   — so an unsafe predicate never reaches evaluation. Rejection throws `SafeExpressionError` (TS) /
   `SafeExpressionException` (C#).

2. **The kernel routes positions to provider instances; it never hardcodes what "unsafe" means.**
   Both kernels gain a second provider slot for predicate positions (`KernelOptions.predicateExpression`
   / a private `_predicateExpr`), defaulted to the safe provider. `interpret`'s gate and `reduce`'s
   action + machine guards evaluate through the predicate provider; `derive` / `assign-from` stay on
   the full provider. The seam signature `eval(expr, data, bindings)` is **unchanged** — policy is
   *which provider instance is wired to which position*, not a flag on the seam. Low-level callers of
   `reduce` / `resolveNode` that do not distinguish positions fall back to the full provider, so the
   conformance matrix is unaffected.

3. **A profile can override either slot** by passing its own `expression` and/or
   `predicateExpression` provider — including widening predicates back to the full language, or
   supplying an entirely different expression language. Safe-by-default is a *wiring* decision, not a
   kernel invariant, which keeps the kernel expression-language-neutral
   ([ADR-0001](ADR-0001-closed-grammar-kernel.md), [ADR-0007](ADR-0007-reference-kernel-implementation.md)).

## Alternatives considered

- **Hardcode the restriction in the kernel.** Rejected: the kernel is deliberately
  expression-language-agnostic. Baking in "no `$eval`/lambda/transform" assumes JSONata and leaks
  expression-language policy into the closed-grammar core.
- **Add a `safe` flag to the `eval` seam signature.** Rejected: it leaks policy into the provider
  contract and forces every provider to understand a JSONata-shaped notion of "safe". Routing by
  provider instance keeps the seam minimal.
- **Runtime denial instead of compile-time.** Rejected: compile-time AST rejection fails loudly and
  early (at document load / first compile) and cannot be reached by crafted data at evaluation time.
- **A single shared provider for all positions (status quo).** Rejected as the *default*: it leaves
  agent-authored predicates with the full injection/DoS surface. It remains available by wiring the
  same provider into both slots.

## Consequences

- Agent-authored predicates are safe by default in both kernels with no profile action required;
  value positions keep the full language.
- Enforcement stayed out of the kernel grammar: the change is a provider mode plus two default
  wirings, so the kernel remains language-neutral and a profile can swap the whole expression
  language.
- These rejections **cannot be corpus-gated** against the canonical engine (canonical *returns a
  value* for `$eval`/lambda/transform), so they are asserted directly: `kernel/test/safe-expression.test.ts`
  (TS) and a safe-subset block appended to the C# corpus runner (`GenUI.Jsonata.Conformance`).
- The safe subset is intentionally minimal (three constructs). If future predicate abuse vectors
  surface (e.g. pathologically expensive pure expressions), they extend the same AST walk rather than
  the kernel.
