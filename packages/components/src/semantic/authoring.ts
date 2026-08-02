import type { ComponentValidationReport } from "../shared/definition";
import {
  createComponentAuthoringApi,
  type ComponentAgentKit,
  type ComponentAuthoringDescription,
  type ComponentAuthoringTool,
  type ComponentCatalogEntry,
  type ComponentPreflightReport,
} from "../shared/component-authoring-internal";
import { semanticComponentDefinitions } from "./registry";

export interface SemanticComponentCatalogEntry extends ComponentCatalogEntry {}
export interface SemanticComponentAuthoringDescription extends ComponentAuthoringDescription {}
export type { ComponentAuthoringTool };
export interface SemanticComponentPreflightReport extends ComponentPreflightReport {}
export interface SemanticComponentAgentKit extends ComponentAgentKit {}

const api = createComponentAuthoringApi({
  definitions: semanticComponentDefinitions,
  kind: "semantic",
  toolKind: "Semantic",
});

export const listSemanticComponents = (): SemanticComponentCatalogEntry[] => api.list();

export const describeSemanticComponent = (
  capability: string,
): SemanticComponentAuthoringDescription => api.describe(capability);

export const validateSemanticComponentProps = (
  capability: string,
  props: unknown,
): ComponentValidationReport => api.validate(capability, props);

export const materializeSemanticComponentTrial = api.materialize;

export const preflightSemanticComponent = (
  capability: string,
  props: unknown,
): SemanticComponentPreflightReport => api.preflight(capability, props);

export const getSemanticComponentAgentInstructions = api.instructions;

export const createSemanticComponentAuthoringTools = (
  components?: readonly string[],
): ComponentAuthoringTool[] => api.createTools(components);

export const getSemanticComponentAgentKit = (
  components?: readonly string[],
): SemanticComponentAgentKit => api.getKit(components);

export const semanticComponentAuthoringTools = createSemanticComponentAuthoringTools();