import { fluentComponentCapabilities, fluentComponentDefinitions, fluentComponentViews } from "../fluent/registry";
import { primitiveComponentCapabilities, primitiveComponentDefinitions, primitiveComponentViews } from "../primitives/registry";
import { semanticComponentCapabilities, semanticComponentDefinitions, semanticComponentViews } from "../semantic/registry";
import { securityComponentCapabilities, securityComponentDefinitions, securityComponentViews } from "../security/registry";
import { softwareComponentCapabilities, softwareComponentDefinitions, softwareComponentViews } from "../software/registry";
import { createAgentFacingCapabilityCatalog } from "./component-authoring-internal";

export { fluentComponentCapabilities, fluentComponentDefinitions, fluentComponentViews } from "../fluent/registry";
export { primitiveComponentCapabilities, primitiveComponentDefinitions, primitiveComponentViews } from "../primitives/registry";
export { semanticComponentCapabilities, semanticComponentDefinitions, semanticComponentViews } from "../semantic/registry";
export { securityComponentCapabilities, securityComponentDefinitions, securityComponentViews } from "../security/registry";
export { softwareComponentCapabilities, softwareComponentDefinitions, softwareComponentViews } from "../software/registry";

export const componentViews = { ...fluentComponentViews, ...primitiveComponentViews, ...semanticComponentViews, ...securityComponentViews, ...softwareComponentViews };
export const componentDefinitions = { ...fluentComponentDefinitions, ...primitiveComponentDefinitions, ...semanticComponentDefinitions, ...securityComponentDefinitions, ...softwareComponentDefinitions };
export const componentCapabilities = { ...fluentComponentCapabilities, ...primitiveComponentCapabilities, ...semanticComponentCapabilities, ...securityComponentCapabilities, ...softwareComponentCapabilities };
export const agentFacingComponentCatalog = createAgentFacingCapabilityCatalog(componentDefinitions);