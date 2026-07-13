import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Json } from "../../kernel/src/index";
import type { ProfileTemplateArtifact, ProfileTemplateResolver, ResourceResolver } from "../../packages/profile/src/profile-core";

function loadTemplateJson(templateId: string, file: string): unknown {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../profile-templates/${templateId}/${file}`, import.meta.url)),
      "utf8"
    )
  );
}

export const resolveProfileTemplate: ProfileTemplateResolver = (id) =>
  loadTemplateJson(id, "template.json") as ProfileTemplateArtifact;

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
  return loadTemplateJson(templateId, file) as Json;
};
