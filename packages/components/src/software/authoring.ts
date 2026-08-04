import type { ComponentValidationReport } from "../shared/definition";
import { createComponentAuthoringApi, type ComponentAgentKit, type ComponentAuthoringDescription, type ComponentAuthoringTool, type ComponentCatalogEntry, type ComponentPreflightReport } from "../shared/component-authoring-internal";
import { softwareComponentDefinitions } from "./registry";

export interface SoftwareComponentCatalogEntry extends ComponentCatalogEntry {}
export interface SoftwareComponentAuthoringDescription extends ComponentAuthoringDescription {}
export interface SoftwareComponentPreflightReport extends ComponentPreflightReport {}
export interface SoftwareComponentAgentKit extends ComponentAgentKit {}
const api = createComponentAuthoringApi({ definitions: softwareComponentDefinitions, kind: "software", toolKind: "Software" });
export const listSoftwareComponents = (): SoftwareComponentCatalogEntry[] => api.list();
export const describeSoftwareComponent = (capability: string): SoftwareComponentAuthoringDescription => api.describe(capability);
export const validateSoftwareComponentProps = (capability: string, props: unknown): ComponentValidationReport => api.validate(capability, props);
export const materializeSoftwareComponentTrial = api.materialize;
export const preflightSoftwareComponent = (capability: string, props: unknown): SoftwareComponentPreflightReport => api.preflight(capability, props);
export const getSoftwareComponentAgentInstructions = api.instructions;
export const createSoftwareComponentAuthoringTools = (components?: readonly string[]): ComponentAuthoringTool[] => api.createTools(components);
export const getSoftwareComponentAgentKit = (components?: readonly string[]): SoftwareComponentAgentKit => api.getKit(components);
export const softwareComponentAuthoringTools = createSoftwareComponentAuthoringTools();