# Generative Interaction Kernel

GIK runs declarative Blueprints as **state + events -> new state + effects**.
Blueprints own stable semantic Cells, dataflow, behavior, and independently
selected service and presentation implementations. The kernel supplies the
closed execution grammar; hosts supply components, storage, integrations,
credentials, and execution authority.

## Choose a package

These are the public core npm packages. Each package README owns its consumer
API and usage documentation; install only the layers your host needs.

| Package | Responsibility |
| --- | --- |
| [gik-blueprint](packages/blueprint/README.md) | Blueprint/Cell validation, deterministic materialization, transitions, workers, and Sense reconciliation |
| [gik-kernel](packages/kernel/README.md) | Executable programs, deterministic reduction, projection resolution, and wire clients |
| [gik-evaluators](packages/evaluators/README.md) | Cell expressions, declarative validators, and JSON Schemas |
| [gik-durable-runtime](packages/durable-runtime/README.md) | Provider-neutral journals, snapshots, leases, queues, and storage connectors |
| [gik-react](packages/react/README.md) | React projection and in-memory/durable Blueprint hosts |
| [gik-controlface](packages/controlface/README.md) | Privileged runtime tools and host-owned service infrastructure |
| [gik-agentface](packages/agentface/README.md) | Filtered authoring/read tool projection; not an authorization system |
| [gik-agent-lifecycle-exp](packages/agent-lifecycle-exp/README.md) | Neutral agent lifecycle, request-scoped drafts, and tool metadata |
| [gik-blueprint-agent-host](packages/blueprint-agent-host/README.md) | Trusted proposal receipts, authorization, admission, and application |
| [gik-transport-http-sse](packages/transport-http-sse/README.md) | HTTP/SSE messages between an authoritative host and a renderer |

The [gik-samples repository](https://github.com/nsreehari/gik-samples) owns
`gik-components`, Blueprint Studio, Finbook, the timer Sense demo, and the local
MCP companion. Its [live site](https://nsreehari.github.io/gik-samples/) also
provides [verified package downloads](https://nsreehari.github.io/gik-samples/vendor/).
That download directory is not an npm registry.

The following workspace packages are **private and not published by this
repository's release workflow**:

- [gik-provider-blueprint-authoring](packages/provider-blueprint-authoring/README.md)
- [gik-provider-step-orchestrator](packages/provider-step-orchestrator/README.md)
- [gik-transport-mcp-http](packages/transport-mcp-http/README.md)
- [gik](packages/gik/README.md), the internal namespace aggregator

Do not assume that a same-named registry package represents these workspace
implementations.

## Runtime boundaries

| Layer | Owns | Does not own |
| --- | --- | --- |
| Blueprint | Semantic Cells, ports, events, services, and two independent lowering axes | Provider execution or secrets |
| Kernel | Grammar, validation, reduction, executable state revisions, and effect declarations | Domain meaning, external I/O, or scheduling |
| Durable runtime | Journal/queue processing and provider-backed persistence | Blueprint interpretation |
| Face projection | Selected callable tools around a runtime or pure helpers | Authentication or blanket execution permission |
| Transport / renderer | Message delivery / declarative presentation | Business authority |
| Host | Trusted adapters, endpoint policy, credentials, invocation and proposal admission | Permission granted by model-authored text |

Every Blueprint declares `serviceTiers`, `serviceRecipes`, `projectionTiers`,
and `projectionRecipes`. Materialization completes the service chain before
the projection chain; the old combined `tiers`/`recipes` shape is rejected.
Presentation slots do not own Cell semantics, and lowering does not restructure
the semantic Cell graph.

### Sources, Senses, and purpose

- **Sources** obtain bounded results, read as `fetched_sources.<id>` in Cell
  expressions. Configuration arrays are still named `sources`; the former
  `sources` expression root has no compatibility alias.
- **Senses** express ongoing observation intent. Hosts supervise bindings and
  deliver discrete Signals as declared events through durable reduction.
  A Sense can use polling, a scheduler, a feed, or an independent agent; it
  does not require an always-running process.
- **DPP Cells** add `dpp.manifest`, context query/ingest sources, and optional
  context Senses. The complete manifest is a reference frame, not executable
  authorization, a new Cell kind, or a scheduler.

Read [Purpose-bearing Cells](docs/dpp.md) and [Cell Senses](docs/senses.md)
for the cross-package dataflow, lifecycle, hosting, and delivery contracts.

## Documentation

Start with the [documentation guide](docs/README.md). It directs consumers to
package READMEs and maintains separate architecture, protocol, conformance,
and decision references rather than duplicating their contents here.

## Development and validation

Use Node.js 24 and npm 11:

```sh
npm install --no-audit --no-fund
npm run build:public-packages
npm test
```

Build workspace declarations before full validation on a clean checkout.
The [Vitest configuration](vitest.config.mjs) defines the projects; use
`npx vitest run --project <name>` for a focused suite, or the corresponding
`test:<name>` script where one exists. `npm test` runs conformance, typecheck,
the JSONata corpus check, and all Vitest projects.

Release procedures belong in [Releasing](docs/releasing.md), not in consumer
installation guides.

## Community and support

- [Contributing](CONTRIBUTING.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Support](SUPPORT.md)
- [Private vulnerability reporting](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
