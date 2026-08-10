# GIK Samples

These samples consume only published GIK package entry points and can be copied into a standalone repository.

## Setup

```sh
npm install
npm run typecheck
npm test
npm run build
```

Run the generic browser host with `npm run dev`. Select a Blueprint with a URL such as
`http://localhost:5175/?b=portfolio-tracker`.

The backend examples have dedicated scripts: `start:backend`, `start:agent`, `start:control`, `start:continuity`, and `start:gik`.

All `@gik/*` dependencies must be released at the versions declared in `package.json` before installing this directory outside the GIK monorepo.

## Blueprint Catalog

Sample Blueprint artifacts and registry metadata are assembled into `apps/host/public/bootstrap/sample-blueprints.bundle.json`. Run `npm run blueprints:bundle` after changing a Blueprint or `blueprints/registry.json`; host development and build commands also regenerate it automatically.

The browser verifies and admits this seed bundle to IndexedDB before rendering. Seed artifacts may reference trusted, statically imported native providers. User-authored artifacts share the catalog snapshot but never receive that authority; executable TypeScript and TSX remain host code rather than catalog data.

## Blueprint Tests

Put structural and materialization cases in `blueprint-tests/*.case.json`. The generic runner validates artifacts, composition, JSON Pointer values, and placement children; `npm run conformance` also validates each case against `../schemas/blueprint-test-case.schema.json`.

Keep lifecycle, effect-handler, controller, persistence, and rendered interaction tests in TypeScript. Tests should resolve Blueprint sources through `shared/blueprints.ts` so they exercise the installed catalog instead of importing individual `blueprint.json` files.

## Credentials

Blueprints declare opaque `credentialRef` values, never access-key values. The sample host recognizes:

| Credential reference | Browser storage | Headless environment variable |
| --- | --- | --- |
| `foundry-agent/access-key` | `gik.foundry-agent.access-key` | `GIK_FOUNDRY_ACCESS_KEY` |
| `http-proxy/access-key` | `gik.http-proxy.access-key` | `GIK_HTTP_PROXY_ACCESS_KEY` |

Headless hosts use the production proxy origins by default. Set `GIK_FOUNDRY_PROXY_ORIGIN` or `GIK_HTTP_PROXY_ORIGIN` to authorize a different deployment, such as locally hosted proxies.

In the GitHub Pages SPA, a credentialed sample opens its access dialog when no key is stored. The key is retained in browser `localStorage` so reloads work. Clearing access removes it, and an HTTP `401` or `403` clears the rejected HTTP proxy key so the dialog can request a replacement. Because this is a public browser application, the key is visible to that browser and user; `localStorage` provides persistence, not secrecy. Do not put credentials in `VITE_*` variables because Vite embeds them in the public bundle.

Blueprint state, external context, materialized Blueprints, events, effects, Journal entries, Ledger entries, and checkpoints must not contain credential values. Service declarations carry only a reference, which the host resolves immediately before invocation.

Headless hosts create registry options with an environment-backed resolver and pass those options to the existing service host or orchestrator:

```ts
import { createHeadlessServiceRegistryOptions } from "./services/host/headless-service-runtime";
import { declarativeServiceOrchestrator } from "./services/host/service-runtime";

const registryOptions = createHeadlessServiceRegistryOptions(process.env);
const wrapOrchestrator = declarativeServiceOrchestrator(runtime, registryOptions);
```

Ordinary tests are hermetic and use mock executors or placeholder credentials. Live automation is opt-in: provide the applicable protected environment variable to the automation host; do not add it to the Blueprint, scenario, test fixture, command line, or checked-in environment file. Mock implementation programs, including `portfolio-tracker-2tiers` with `marketMode: "mock"`, execute without resolving a credential.
