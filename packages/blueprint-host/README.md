# @gik/blueprint-host

`BlueprintHost` is the small React adapter that opens a Blueprint through ControlFace and mounts
the resulting vocabulary, program, and initial state through `BundleCompositionHost`.

## External services

Blueprints declare logical services and operation contracts. `BlueprintHost` does not admit
service kinds, resolve credentials, authorize endpoints, or construct a `ServiceHost`. Those are
outer-host policy decisions under ADR-0040.

An application host that supports external services:

1. opens the Blueprint runtime through ControlFace when preparing host-native capabilities;
2. registers trusted service-kind factories and environment policy;
3. supplies a `BundleNative` whose `wrapOrchestrator` constructs one `DefaultServiceHost` from the
	opened runtime declarations and the live state supplied by the React adapter; and
4. passes that `BundleNative` through the `native` prop.

This is the same composition used by the sample host in `samples/shared/service-runtime.ts` and
`samples/shared/sample-bundles.ts`. It keeps service execution outside Blueprint, React projection,
and demo-runner packages while preserving Blueprint-owned request, validation, and settlement data.

`@gik/blueprint-host` and `@gik/demo-runner-host` intentionally do not depend on each other. A
caller may inject `BlueprintHost` as the demo runner's `HostComponent`.