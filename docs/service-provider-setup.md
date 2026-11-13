# Service provider setup and host dependencies

## Non-repeatable operations

Native service kind manifests can declare mechanical constraints by provider
operation name (not Blueprint invocation alias):

```ts
operationConstraints: {
  send: { queueable: false, retryable: false },
}
```

The host rejects queue admission before materialization or credential acquisition
when `queueable` is false, and rechecks at execution. When `retryable` is false,
transport failures terminate the queued attempt and response guardrail failures
settle as failures without retry/correction calls. An immediate invocation is
still allowed if otherwise authorized. Omitted constraints preserve existing
behavior. These constraints do not confer permission, replace confirmation, or
bypass endpoint admission, authorization snapshots or live kill switches.

Non-idempotent providers such as Gmail send must declare both constraints; merely
rejecting `mode: "queued"` in provider validation does not prevent explicit host
enqueue calls. Publish the shared contract before consuming it in independent
provider packages.

Provider setup is independent of UI. A settings page, CLI or deployment tool can
satisfy the same requirements; a Blueprint does not launch a login flow.

## Ownership

- The service-kind manifest owns the non-secret `configSchema` and required host
  capabilities. A provider's optional `describeDependencies(declaration)` returns
  requirements derived from validated configuration and declared operations.
- Native Blueprint service configuration owns concrete non-secret values and
  references such as `credentialRef`. A reference is not a credential or grant.
- The application host chooses which provider factories to import and register.
  It owns connection setup, endpoint and invocation authorization, credentials,
  expiry, revocation and any refresh-token storage.
- GIK owns the shared contracts. Concrete open-source integrations belong in the
  samples repository's provider package. That package must expose individual
  subpaths, with no root export aggregating every provider.

Do not put literal keys, tokens, refresh tokens or credential values in a
Blueprint, requirement, setup status, action schema, event or journal.

## Describe requirements without connecting

The following is an illustrative provider hook, not a built-in Gmail provider:

```ts
describeDependencies(declaration) {
  const { credentialRef } = serviceConfig(declaration);
  const sendsMail = Object.values(declaration.operations)
    .some(({ operation }) => operation === "send");
  return [{
    id: "google-account",
    kind: "credential",
    ref: String(credentialRef),
    title: "Google account",
    scheme: "google-oauth2",
    permissions: [
      "https://www.googleapis.com/auth/gmail.readonly",
      ...(sendsMail ? ["https://www.googleapis.com/auth/gmail.send"] : []),
    ],
  }];
}
```

The provider's config schema must validate `credentialRef` before this hook
runs. Dependency IDs are unique within a service. `scheme` and `permissions`
are provider-defined identifiers interpreted by the host, not a new OAuth
implementation or a portable authorization policy.

`ServiceKindRegistry.describe()` supplies kind schemas and missing host
capabilities before service configuration exists.
`registry.describeSetup(identity, declaration)` validates a configured service,
then asks the host about its dependencies. The report contains validation,
dependency requirements/statuses and `ready`. Invalid configuration produces
validation errors without calling dependency inspection.

`DefaultServiceHost.describeServiceSetup(serviceId)` exposes the same report
for a native service. Blueprint-backed services must be inspected through the
host responsible for their internal declarations.

Neither path creates an adapter, resolves a credential, fetches OAuth metadata,
or invokes a setup action. Custom factory validation and dependency-description
hooks must remain pure; they must not invoke host runtime ports or start setup.

## Supply host readiness

The host provides `inspectDependency(requirement, identity)` when constructing
`ServiceKindRegistry`. It reads current host-owned state synchronously.
Network-based verification, provisioning and token refresh happen outside this
callback; their results update the host's readiness state.
Asynchronous inspection or dependency-description hooks are rejected as contract
errors. If such a hook's promise rejects, its failure is retained as the contract
error's `cause` once it settles, rather than becoming an unhandled rejection.

The status is one of:

| State | Meaning |
| --- | --- |
| `ready` | The host currently considers the dependency usable |
| `missing` | Configuration or a connection has not been supplied |
| `authorization-required` | Initial authorization or reauthorization is needed |
| `insufficient-permissions` | The connection lacks required permissions |
| `unavailable` | The host cannot currently supply this dependency |

Non-ready statuses require an explanatory message. A host may include
`actions` with stable IDs, titles, optional input schemas and
`requiresUserInteraction`. Those are descriptions of host-implemented actions,
not executable code or URLs supplied by a Blueprint.

A browser can render a Connect button or form. A CLI can offer a setup command.
A headless host can report that an operator must provision the connection.
Only the host maps action IDs to trusted handlers; GIK never automatically
executes actions, collects secrets, or opens authorization windows.

Different services and tenants may use the same `ref` spelling. Resolve and
inspect references using the supplied service identity and authenticated host
context; never treat a globally matching string as authorization.

## Execute and recheck

For kinds that declare dependencies, both registry materialization methods
check readiness before creating or returning a cached adapter. Missing host
inspection is explicitly `unavailable`; legacy kinds without the hook retain
their existing behavior. Non-ready dependencies throw
`UnsatisfiedServiceDependencyError` with the requirement and status.

Adapters must also use
`requireServiceDependency(context, requirement, request.service)` before
using an already-held connection or emitting ongoing observations, so expiry or
revocation does not remain hidden behind adapter caching. The helper does not
resolve credentials; existing host credential-resolution ports remain in use.
The third argument is mandatory: `context.identity.serviceId` identifies the
creating declaration, which can differ from the current service when
`per-blueprint` continuity shares an adapter. Use the actual execution request's
`service`, or capture the observation request's `service` for each delivery.
`inspectServiceDependency(context, requirement, serviceId)` follows the same rule.
Runtime failures preserve the non-secret status in the normal service request
error detail and failure settlement when a request has been recorded.

Readiness is not execution permission. Keep the existing invocation authorizer,
endpoint authorization and kill-switch enforcement. A ready Gmail connection
does not authorize sending an arbitrary message. Do not retry an uncertain send
as if transport retry guaranteed business idempotency.

## Browser and headless OAuth

A browser host can use a short-lived Google Identity Services session, similar
to the Finbook reference integration. Google account sign-in and Drive consent
do not grant Gmail permissions; request the required scopes explicitly.

An unattended host needs an appropriately authorized, host-managed refreshable
connection. Initial consent can take place in a separate setup application or
CLI. Revoked or insufficient consent remains a dependency failure; background
execution must not try to open a login popup.

Gmail scopes have provider-specific verification obligations; see
[Google's scope documentation](https://developers.google.com/workspace/gmail/api/auth/scopes).
Apps Script may be an application backend, but does not replace OAuth consent.
