import type { CapabilityDescriptor } from "@gik/kernel";
import type { ProjectionView } from "@gik/react";
import { fluentComponentCapabilities, fluentComponentViews } from "@gik/components/fluent";
import { primitiveComponentCapabilities, primitiveComponentViews } from "@gik/components/primitives";
import { semanticComponentCapabilities, semanticComponentViews } from "@gik/components/semantic";
import { securityComponentCapabilities, securityComponentViews } from "@gik/components/security";
import { softwareComponentCapabilities, softwareComponentViews } from "@gik/components/software";
import { resolveSampleNativeProjectionViews } from "./native-projections";
import { credentialAccessViews } from "./credential-access";

const projectionProviders: Record<string, Record<string, ProjectionView>> = {
  fluent: fluentComponentViews,
  host: credentialAccessViews,
  primitive: primitiveComponentViews,
  semantic: semanticComponentViews,
  security: securityComponentViews,
  software: softwareComponentViews,
};

export function resolveProjectionViews(id: string): Record<string, ProjectionView> | undefined {
  return projectionProviders[id] ?? resolveSampleNativeProjectionViews(id);
}

// The descriptor-side counterpart of `projectionProviders`: every real published component's own
// props/events/slots/dataProp descriptor, keyed by the SAME provider ids `runtime.externals.
// projectionViews` aliases resolve `from` against, so a Blueprint's own capability strings
// ("<alias>:<name>") land on the real descriptor validateBlueprintArtifact's terminal check reads,
// not just an admitted name. "host" (sample-native credential-access leaves) and any bundle-native
// projection view resolved via `resolveSampleNativeProjectionViews` have no published-package
// descriptor equivalent to offer here; they simply keep falling back to the permissive descriptor,
// exactly like an unresolved capability already does.
const capabilityDescriptorProviders: Record<string, Record<string, CapabilityDescriptor>> = {
  fluent: fluentComponentCapabilities,
  primitive: primitiveComponentCapabilities,
  semantic: semanticComponentCapabilities,
  security: securityComponentCapabilities,
  software: softwareComponentCapabilities,
};

export function resolveCapabilityDescriptors(id: string): Record<string, CapabilityDescriptor> | undefined {
  return capabilityDescriptorProviders[id];
}

