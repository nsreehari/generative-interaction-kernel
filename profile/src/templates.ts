import type { Json } from "../../kernel/src/index";
import type { ProfileTemplateArtifact, ProfileTemplateResolver, ResourceResolver } from "./profile-core";
import genuiAuthoringChecksJson from "../../profile-templates/genui/authoring-checks.json" with { type: "json" };
import genuiConsoleInspectorJson from "../../profile-templates/genui/console-inspector.json" with { type: "json" };
import genuiLayerVocabularyJson from "../../profile-templates/genui/layer-vocabulary.json" with { type: "json" };
import genuiTemplateJson from "../../profile-templates/genui/template.json" with { type: "json" };
import genuiInteractionSchemaJson from "../../profile-templates/genui/schemas/interaction.schema.json" with { type: "json" };
import genuiPresentationSchemaJson from "../../profile-templates/genui/schemas/presentation.schema.json" with { type: "json" };
import genuiRuntimeDocumentSchemaJson from "../../profile-templates/genui/schemas/runtime-document.schema.json" with { type: "json" };
import genuiSchemaValidatorsJson from "../../profile-templates/genui/schema-validators.json" with { type: "json" };
import genuiTaxonomyJson from "../../profile-templates/genui/taxonomy.json" with { type: "json" };
import genuiWorkflowSchemaJson from "../../profile-templates/genui/schemas/workflow.schema.json" with { type: "json" };
import genui1AuthoringChecksJson from "../../profile-templates/genui1/authoring-checks.json" with { type: "json" };
import genui1ConsoleInspectorJson from "../../profile-templates/genui1/console-inspector.json" with { type: "json" };
import genui1LayerVocabularyJson from "../../profile-templates/genui1/layer-vocabulary.json" with { type: "json" };
import genui1TemplateJson from "../../profile-templates/genui1/template.json" with { type: "json" };
import genui1InteractionSchemaJson from "../../profile-templates/genui1/schemas/interaction.schema.json" with { type: "json" };
import genui1PresentationSchemaJson from "../../profile-templates/genui1/schemas/presentation.schema.json" with { type: "json" };
import genui1RuntimeDocumentSchemaJson from "../../profile-templates/genui1/schemas/runtime-document.schema.json" with { type: "json" };
import genui1SchemaValidatorsJson from "../../profile-templates/genui1/schema-validators.json" with { type: "json" };
import genui1TaxonomyJson from "../../profile-templates/genui1/taxonomy.json" with { type: "json" };
import genui1WorkflowSchemaJson from "../../profile-templates/genui1/schemas/workflow.schema.json" with { type: "json" };

const templateArtifacts: Record<string, ProfileTemplateArtifact> = {
  genui: genuiTemplateJson as ProfileTemplateArtifact,
  genui1: genui1TemplateJson as ProfileTemplateArtifact,
};

const templateFiles: Record<string, Record<string, Json>> = {
  genui: {
    "authoring-checks.json": genuiAuthoringChecksJson as Json,
    "console-inspector.json": genuiConsoleInspectorJson as unknown as Json,
    "layer-vocabulary.json": genuiLayerVocabularyJson as Json,
    "taxonomy.json": genuiTaxonomyJson as Json,
    "schema-validators.json": genuiSchemaValidatorsJson as Json,
    "schemas/workflow.schema.json": genuiWorkflowSchemaJson as Json,
    "schemas/interaction.schema.json": genuiInteractionSchemaJson as Json,
    "schemas/presentation.schema.json": genuiPresentationSchemaJson as Json,
    "schemas/runtime-document.schema.json": genuiRuntimeDocumentSchemaJson as Json,
  },
  genui1: {
    "authoring-checks.json": genui1AuthoringChecksJson as Json,
    "console-inspector.json": genui1ConsoleInspectorJson as unknown as Json,
    "layer-vocabulary.json": genui1LayerVocabularyJson as Json,
    "taxonomy.json": genui1TaxonomyJson as Json,
    "schema-validators.json": genui1SchemaValidatorsJson as Json,
    "schemas/workflow.schema.json": genui1WorkflowSchemaJson as Json,
    "schemas/interaction.schema.json": genui1InteractionSchemaJson as Json,
    "schemas/presentation.schema.json": genui1PresentationSchemaJson as Json,
    "schemas/runtime-document.schema.json": genui1RuntimeDocumentSchemaJson as Json,
  },
};

export const resolveProfileTemplate: ProfileTemplateResolver = (id) => {
  const artifact = templateArtifacts[id];
  if (!artifact) {
    throw new Error(`Unknown profile template '${id}'`);
  }
  return artifact;
};

export const resolveProfileTemplateResource: ResourceResolver = (ref, _name) => {
  const prefix = "profile-template:";
  if (!ref.startsWith(prefix)) {
    throw new Error(`Unsupported profile-template resource ref '${ref}'`);
  }

  const path = ref.slice(prefix.length);
  const slash = path.indexOf("/");
  if (slash < 0) {
    throw new Error(`Profile-template resource ref '${ref}' must include '<template>/<file>'`);
  }

  const templateId = path.slice(0, slash);
  const file = path.slice(slash + 1);
  const template = templateFiles[templateId];
  const value = template?.[file];
  if (value === undefined) {
    throw new Error(`Unknown profile-template resource ref '${ref}'`);
  }
  return value;
};

export function profileTemplateResourceRef(templateId: string, file: string): string {
  return `profile-template:${templateId}/${file}`;
}

export function requiredProfileTemplateFile(template: ProfileTemplateArtifact, name: string): string {
  const file = template.payload.files?.[name];
  if (typeof file !== "string" || file.length === 0) {
    throw new Error(`Template '${template.payload.id}' file '${name}' is missing`);
  }
  return file;
}

export function resolveProfileTemplateFile(templateId: string, file: string): Json {
  return resolveProfileTemplateResource(profileTemplateResourceRef(templateId, file), file);
}

export function resolveNamedProfileTemplateFile(template: ProfileTemplateArtifact, name: string): Json {
  return resolveProfileTemplateFile(template.payload.id, requiredProfileTemplateFile(template, name));
}