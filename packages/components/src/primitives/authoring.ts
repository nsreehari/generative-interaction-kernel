import type { ComponentValidationReport } from "../shared/definition";
import {
  createComponentAuthoringApi,
  type ComponentAgentKit,
  type ComponentAuthoringDescription,
  type ComponentAuthoringTool,
  type ComponentCatalogEntry,
  type ComponentPreflightReport,
} from "../shared/component-authoring-internal";
import { primitiveComponentDefinitions } from "./registry";

export interface PrimitiveComponentCatalogEntry extends ComponentCatalogEntry {}
export interface PrimitiveComponentAuthoringDescription extends ComponentAuthoringDescription {}
export interface PrimitiveComponentPreflightReport extends ComponentPreflightReport {}
export interface PrimitiveComponentAgentKit extends ComponentAgentKit {}

const api = createComponentAuthoringApi({
  definitions: primitiveComponentDefinitions,
  kind: "primitive",
  toolKind: "Primitive",
});

export const listPrimitiveComponents = (): PrimitiveComponentCatalogEntry[] => api.list();

export const describePrimitiveComponent = (
  capability: string,
): PrimitiveComponentAuthoringDescription => api.describe(capability);

export const validatePrimitiveComponentProps = (
  capability: string,
  props: unknown,
): ComponentValidationReport => api.validate(capability, props);

export const materializePrimitiveComponentTrial = api.materialize;

export const preflightPrimitiveComponent = (
  capability: string,
  props: unknown,
): PrimitiveComponentPreflightReport => api.preflight(capability, props);

export const getPrimitiveComponentAgentInstructions = api.instructions;

export const createPrimitiveComponentAuthoringTools = (
  components?: readonly string[],
): ComponentAuthoringTool[] => api.createTools(components);

export const getPrimitiveComponentAgentKit = (
  components?: readonly string[],
): PrimitiveComponentAgentKit => api.getKit(components);

export const primitiveComponentAuthoringTools = createPrimitiveComponentAuthoringTools();