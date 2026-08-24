# GIK Samples

These samples consume only published GIK package entry points and can be copied into a standalone repository.

## Setup

```sh
npm install
npm run typecheck
npm test
npm run build
```

Run the generic browser host with `npm run dev`. Open a Blueprint with a URL such as
`http://localhost:5175/?b=portfolio-tracker-new`. Without a `b` parameter the host renders
`apps/browser-host/src/AppRootPage.tsx`, an ordinary React/Fluent page that mounts two named
presentation regions (`blueprint-catalog` and `blueprint-preview`) exported by a single embedded
`blueprint-studio` instance; it never falls back to the catalog's default Blueprint.

`apps/browser-host` runs catalog Blueprints through `@gik/react`. `apps/node-host` composes
`@gik/blueprint`, `@gik/kernel`, the Face packages, and transports directly; start it with
`npm run start:node -- --profile <id>`. Either host can execute a projected or presentation-free
Blueprint. A host that does not mount a renderer simply leaves the presentation output unconsumed.
Do not add a `headless` representation solely to support such a host; representation choices describe
authored output, while renderer ownership belongs to the host.
The stateless AgentFace MCP transport sample remains under `examples/` because it does not host a Blueprint.

All `@gik/*` dependencies must be released at the versions declared in `package.json` before installing this directory outside the GIK monorepo.

## Directory Boundaries

- `apps/` contains independently runnable hosts and their platform-specific policy, storage, transports, and native composition.
- `service-kinds/` contains reusable service-kind implementations, manifests, and registry construction. It must not import an app or access browser/Node globals.
- `blueprints/` contains declarative artifacts and Blueprint-owned native handlers, views, services, and assets. Native code must not import host storage or policy.
- `catalog/` contains only Blueprint catalog construction, parsing, verification, installation, lookup, and the generated seed.
- `config/` contains checked-in non-secret host defaults and their selection/substitution helper.
- `examples/` contains standalone public-API demonstrations that are not part of the catalog hosts.
- `storybook/` contains visual component development surfaces; `tests/` contains cross-boundary and catalog-wide tests.

## Blueprint Catalog

`catalog/` owns the shared runtime catalog module, builder, and generated seed. The builder assembles
every `blueprints/*/blueprint.json` artifact plus the launch profiles in `blueprints/registry.json`
into `catalog/bootstrap/sample-blueprints.bundle.json`. Run `npm run blueprints:bundle` after changing
a Blueprint or the registry; host development and build commands also regenerate it automatically.

Launch profiles are environment-neutral named presets. They may declare concrete required
capabilities, but they do not classify Blueprints by browser, Node, service, worker, projected, or
headless execution. Each application chooses a profile and supplies the dependencies it requires.

The browser verifies and admits this seed bundle to IndexedDB before rendering. Seed artifacts may reference trusted, statically imported native providers. User-authored artifacts share the catalog snapshot but never receive that authority; executable TypeScript and TSX remain host code rather than catalog data.

## Blueprint Tests

Put structural and materialization cases beside their owning Blueprint as `blueprints/<id>/*.case.json`. The generic runner validates artifacts, composition, JSON Pointer values, and placement children; `npm run conformance` also validates each case against `../packages/evaluators/schemas/blueprint-test-case.schema.json`.

Keep lifecycle, effect-handler, controller, persistence, and rendered interaction tests in TypeScript. Tests should resolve Blueprint sources through `catalog/blueprint-catalog.ts` so they exercise the installed catalog instead of importing individual `blueprint.json` files.

## Credentials

Blueprints declare opaque `credentialRef` values, never access-key values. The sample host recognizes:

| Credential reference | Browser storage | Headless environment variable |
| --- | --- | --- |
| `foundry-agent/access-key` | `gik.foundry-agent.access-key` | `GIK_FOUNDRY_ACCESS_KEY` |
| `http-proxy/access-key` | `gik.http-proxy.access-key` | `GIK_HTTP_PROXY_ACCESS_KEY` |

Headless hosts use the production proxy origins by default. Set `GIK_FOUNDRY_PROXY_ORIGIN` or `GIK_HTTP_PROXY_ORIGIN` to authorize a different deployment, such as locally hosted proxies.

In the GitHub Pages SPA, a credentialed sample opens its access dialog when no key is stored. The key is retained in browser `localStorage` so reloads work. Clearing access removes it, and an HTTP `401` or `403` clears the rejected HTTP proxy key so the dialog can request a replacement. Because this is a public browser application, the key is visible to that browser and user; `localStorage` provides persistence, not secrecy. Do not put credentials in `VITE_*` variables because Vite embeds them in the public bundle.

Blueprint state, external context, materialized Blueprints, events, effects, Journal entries, Ledger entries, and checkpoints must not contain credential values. Service declarations carry only a reference, which the host resolves immediately before invocation.

The Node host owns environment-backed credential resolution and service-host construction:

```ts
import {
	createNodeBlueprintServiceHost,
	nodeServiceOrchestrator,
} from "./apps/node-host/service-host";

const serviceHost = createNodeBlueprintServiceHost(runtime, state, process.env);
const wrapOrchestrator = nodeServiceOrchestrator(runtime, serviceHost);
```

Ordinary tests are hermetic and use mock executors or placeholder credentials. Live automation is opt-in: provide the applicable protected environment variable to the automation host; do not add it to the Blueprint, scenario, test fixture, command line, or checked-in environment file. The `portfolio-tracker-new` mock intelligence implementation executes without resolving a credential.

## Sample agent provisioning

Sample Blueprints own their provider-neutral agent templates, prompts, lifecycle tools, and response
schemas in `blueprints/agent-provisioning.mjs`. Provisioning is initiated from this package; provider
repositories only perform provider-specific upserts from generated temporary plans.

```bash
npm run agents:provision:foundry --workspace @gik/samples
npm run agents:provision:copilot --workspace @gik/samples
```

Use `-- --agents NameA,NameB` for a selective Foundry version update. Foundry provisioning requires
an active Azure CLI login. Copilot provisioning writes the sample workspace through the generic
`demo-boards-ns-code/mcp-server` plan consumer.
