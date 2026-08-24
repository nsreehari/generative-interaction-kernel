# Vendored: yaml-flow engine cores (reactive graph + StepMachine)

These files are an owned, in-repo copy of two proven engines from the sibling **yaml-flow** runtime,
vendored here so genui provider adapters can build on them with **no external `yaml-flow` dependency**.
This follows the same discipline as [`kernel/src/vendor/`](../../kernel/src/vendor/README.md) (canonical
JSONata) and the decision recorded in
[ADR-0033](../../docs/decisions/ADR-0033-provider-engines-reactive-statemodel-step-orchestrator.md).

## Provenance and license

- **Source repository:** <https://github.com/nsreehari/yaml-flow>
- **Source revision:** `59d90e03d788a27da80dc883b0a9f0f97c5ca08e`
- **Imported by GIK commit:** `55ae905105046f45b0feda4248ff9938a47f34c6`
- **License declared by the source project:** MIT

The source repository and GIK are owned by the same author. The imported subset
remains covered by the MIT terms declared by `yaml-flow`; GIK records it in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md) so its separate origin
is retained when the framework is distributed.

## What is here

| Directory | Source (`yaml-flow/src/...`) | Purpose |
|---|---|---|
| `event-graph/` | `event-graph/{types,constants,graph-helpers,task-transitions}.ts` | Shared reducer types + pure task-state transitions |
| `continuous-event-graph/` | `continuous-event-graph/{reactive,core,schedule,journal,types}.ts` | Push-based, self-sustaining dependency graph (`createReactiveGraph`) |
| `step-machine/` | `step-machine/{StepMachine,reducer,types,index}.ts` | Durable, branching, resumable workflow executor over a pure reducer |
| `stores/` | `stores/memory.ts` | In-memory `StepMachineStore` |

The layout **mirrors `yaml-flow/src/`** for the copied subset, so every relative import inside these
files (`../event-graph/types.js`, `../stores/memory.js`) resolves unchanged.

## Do not hand-edit the crux

The algorithmic cores — the reactive drain/schedule/dispatch loop and the StepMachine reducer — are
copied **verbatim** and must stay that way. To refresh, re-copy the listed files from `yaml-flow/src/`
at a pinned point and re-apply only the two edits below.

### Permitted, minimal edits (the only ones applied)

1. **`step-machine/index.ts`** — the `loader.js` (YAML/`fs`) and `schema-validator.js` (ajv + external
   JSON schema) re-export lines are removed. The provider path builds `StepFlowConfig` from JSON
   directly and needs neither.

### Deliberately NOT copied (out of the provider path / external deps)

- `event-graph/{scheduler,reducer,conflict-resolution,completion,stuck-detection,plan,validate,loader,mermaid,schema-validator}.ts` — the batch-execution engine + visualizers + ajv/YAML loaders; the continuous (reactive) path has its own `core.ts` + `schedule.ts`.
- `continuous-event-graph/{handlers,inspect,mutate,validate,live-cards-bridge}.ts` — node-`child_process` shell handler, visualizers, and yaml-flow domain glue.
- `step-machine/{loader,schema-validator}.ts` and the entire `step-machine-public/` (yaml-flow `cli/common` domain glue).
- All other `stores/*` (file/kv/localStorage) — only the in-memory store is needed.

## Consumers

- [`providers/reactive-state-model/`](../reactive-state-model/) — wraps `continuous-event-graph/reactive.ts`
  as a genui `StateModel` (incremental derived state).
- `providers/step-orchestrator/` (follow-up) — wraps `step-machine/StepMachine.ts` as a genui `Orchestrator`.
