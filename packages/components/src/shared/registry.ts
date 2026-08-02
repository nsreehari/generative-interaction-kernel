import { fluentComponentCapabilities, fluentComponentDefinitions, fluentComponentViews } from "../fluent/registry";
import { primitiveComponentCapabilities, primitiveComponentDefinitions, primitiveComponentViews } from "../primitives/registry";
import { semanticComponentCapabilities, semanticComponentDefinitions, semanticComponentViews } from "../semantic/registry";

export { fluentComponentCapabilities, fluentComponentDefinitions, fluentComponentViews } from "../fluent/registry";
export { primitiveComponentCapabilities, primitiveComponentDefinitions, primitiveComponentViews } from "../primitives/registry";
export { semanticComponentCapabilities, semanticComponentDefinitions, semanticComponentViews } from "../semantic/registry";

export const componentViews = { ...fluentComponentViews, ...primitiveComponentViews, ...semanticComponentViews };
export const componentDefinitions = { ...fluentComponentDefinitions, ...primitiveComponentDefinitions, ...semanticComponentDefinitions };
export const componentCapabilities = { ...fluentComponentCapabilities, ...primitiveComponentCapabilities, ...semanticComponentCapabilities };