import type { Json } from "../../kernel/src/index";
import type { ProfileTemplateArtifact, ProfileTemplateResolver, ResourceResolver } from "../../packages/profile/src/profile-core";
import genuiTemplateJson from "../../profile-templates/genui/template.json" with { type: "json" };
import genuiTaxonomyJson from "../../profile-templates/genui/taxonomy.json" with { type: "json" };
import genui1TemplateJson from "../../profile-templates/genui1/template.json" with { type: "json" };
import genui1TaxonomyJson from "../../profile-templates/genui1/taxonomy.json" with { type: "json" };

const templateArtifacts: Record<string, ProfileTemplateArtifact> = {
  genui: genuiTemplateJson as ProfileTemplateArtifact,
  genui1: genui1TemplateJson as ProfileTemplateArtifact,
};

const templateFiles: Record<string, Record<string, Json>> = {
  genui: {
    "taxonomy.json": genuiTaxonomyJson as Json,
  },
  genui1: {
    "taxonomy.json": genui1TaxonomyJson as Json,
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
