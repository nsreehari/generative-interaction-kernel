import {
  semanticComponentCapabilities,
  semanticComponentViews,
} from "@gik/components/semantic";
import { ComponentDataSections } from "./ComponentDataSections";

export const SEMANTIC_COMPONENT_CAPABILITIES = semanticComponentCapabilities;
export const SEMANTIC_COMPONENT_VIEWS = semanticComponentViews;

export default { ...SEMANTIC_COMPONENT_VIEWS, "component-data-sections": ComponentDataSections };