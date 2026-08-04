import type { ComponentValidationReport } from "../shared/definition";
import { createComponentAuthoringApi, type ComponentAgentKit, type ComponentAuthoringDescription, type ComponentAuthoringTool, type ComponentCatalogEntry, type ComponentPreflightReport } from "../shared/component-authoring-internal";
import { securityComponentDefinitions } from "./registry";

export interface SecurityComponentCatalogEntry extends ComponentCatalogEntry {}
export interface SecurityComponentAuthoringDescription extends ComponentAuthoringDescription {}
export interface SecurityComponentPreflightReport extends ComponentPreflightReport {}
export interface SecurityComponentAgentKit extends ComponentAgentKit {}
const api = createComponentAuthoringApi({ definitions: securityComponentDefinitions, kind: "security", toolKind: "Security" });
export const listSecurityComponents = (): SecurityComponentCatalogEntry[] => api.list();
export const describeSecurityComponent = (capability: string): SecurityComponentAuthoringDescription => api.describe(capability);
export const validateSecurityComponentProps = (capability: string, props: unknown): ComponentValidationReport => api.validate(capability, props);
export const materializeSecurityComponentTrial = api.materialize;
export const preflightSecurityComponent = (capability: string, props: unknown): SecurityComponentPreflightReport => api.preflight(capability, props);
export const getSecurityComponentAgentInstructions = api.instructions;
export const createSecurityComponentAuthoringTools = (components?: readonly string[]): ComponentAuthoringTool[] => api.createTools(components);
export const getSecurityComponentAgentKit = (components?: readonly string[]): SecurityComponentAgentKit => api.getKit(components);
export const securityComponentAuthoringTools = createSecurityComponentAuthoringTools();