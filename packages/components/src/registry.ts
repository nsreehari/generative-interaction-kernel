import { primitiveComponentCapabilities, primitiveComponentDefinitions, primitiveComponentViews } from "./primitive-registry";
import { semanticComponentCapabilities, semanticComponentDefinitions, semanticComponentViews } from "./semantic-registry";

export { primitiveComponentCapabilities, primitiveComponentDefinitions, primitiveComponentViews } from "./primitive-registry";
export { semanticComponentCapabilities, semanticComponentDefinitions, semanticComponentViews } from "./semantic-registry";

export const componentViews = { ...primitiveComponentViews, ...semanticComponentViews };
export const componentDefinitions = { ...primitiveComponentDefinitions, ...semanticComponentDefinitions };
export const componentCapabilities = { ...primitiveComponentCapabilities, ...semanticComponentCapabilities };