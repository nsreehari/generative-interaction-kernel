import type { ComponentValidationReport } from "../shared/definition";
import {
  createComponentAuthoringApi,
  type ComponentAgentKit,
  type ComponentAuthoringDescription,
  type ComponentAuthoringTool,
  type ComponentCatalogEntry,
  type ComponentPreflightReport,
} from "../shared/component-authoring-internal";
import { fluentComponentDefinitions } from "./registry";

export interface FluentComponentCatalogEntry extends ComponentCatalogEntry {}
export interface FluentComponentAuthoringDescription extends ComponentAuthoringDescription {}
export interface FluentComponentPreflightReport extends ComponentPreflightReport {}
export interface FluentComponentAgentKit extends ComponentAgentKit {}

const api = createComponentAuthoringApi({
  definitions: fluentComponentDefinitions,
  kind: "fluent",
  toolKind: "Fluent",
});

export const listFluentComponents = (): FluentComponentCatalogEntry[] => api.list();

export const describeFluentComponent = (
  capability: string,
): FluentComponentAuthoringDescription => api.describe(capability);

export const validateFluentComponentProps = (
  capability: string,
  props: unknown,
): ComponentValidationReport => api.validate(capability, props);

export const materializeFluentComponentTrial = api.materialize;

export const preflightFluentComponent = (
  capability: string,
  props: unknown,
): FluentComponentPreflightReport => api.preflight(capability, props);

export const getFluentComponentAgentInstructions = api.instructions;

export const createFluentComponentAuthoringTools = (
  components?: readonly string[],
): ComponentAuthoringTool[] => api.createTools(components);

export const getFluentComponentAgentKit = (
  components?: readonly string[],
): FluentComponentAgentKit => api.getKit(components);

export const fluentComponentAuthoringTools = createFluentComponentAuthoringTools();
