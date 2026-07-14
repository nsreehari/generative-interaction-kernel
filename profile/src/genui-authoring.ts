import type { Json } from "../../kernel/src/index";
import documentSchemaJson from "../../schemas/document.schema.json" with { type: "json" };
import { executeSyncJsonataSteps } from "../../shared/libs/evaluators";
import { runDeclarativeValidators } from "../../shared/libs/validators";
import {
  buildStructuralValidatorsForTemplate,
  type StructuralSchemaValidatorRef,
} from "./schema";
import type { AuthoringRegistry, AuthoringReport, LayerDefinition, Profile, ProfileArtifact, ProfileTemplateArtifact } from "./profile-core";
import { resolveFacets, type InteractionKind, type InteractionSpec, type InteractionTaxonomy } from "./genui";
import {
  requiredProfileTemplateFile,
  resolveNamedProfileTemplateFile,
  resolveProfileTemplate,
  resolveProfileTemplateResource,
} from "./templates";

const emptyReport = (): AuthoringReport => ({ ok: true, errors: [], warnings: [] });

type DetailTemplate = string;
type WarningTemplate = { code: string; detailTemplate: DetailTemplate };
type FacetBackedLayerCheckConfig = {
  schemaFile: string;
  kind: "facet-backed-layer";
  steps: readonly { expr: string; writeTo: string }[];
  unknownInteractionDetailTemplate: DetailTemplate;
  missingRequiredDetailTemplate: DetailTemplate;
  warnings: {
    unknownRegion: WarningTemplate;
    roleMismatch: WarningTemplate;
  };
};
type IntentSpecCheckConfig = {
  shapeValidators: readonly unknown[];
  targetSteps: readonly { expr: string; writeTo: string }[];
  warning: WarningTemplate;
};
type GenuiAuthoringChecksConfig = {
  intentSpec: IntentSpecCheckConfig;
  layerSemantics: readonly FacetBackedLayerCheckConfig[];
};

type FacetBackedLayerRegion = { name?: string; role?: string };
type FacetBackedLayerSpec = {
  source?: InteractionSpec;
  regions?: FacetBackedLayerRegion[];
};

type IntentSpec = {
  goal?: string;
  priorities?: string[];
  constraints?: string[];
};

const documentSchemaRef = {
  schema: documentSchemaJson as Record<string, unknown>,
  key: typeof (documentSchemaJson as { $id?: unknown }).$id === "string"
    ? (documentSchemaJson as { $id: string }).$id
    : undefined,
};

if (!documentSchemaRef.key) {
  throw new Error("Document schema is missing a string $id");
}

const structuralValidatorRefs: Record<string, StructuralSchemaValidatorRef> = {
  [documentSchemaRef.key]: documentSchemaRef,
};

const schemaRefFromTemplateFile = (templateId: string, file: string): string => {
  const slash = file.lastIndexOf("/");
  const fileName = slash >= 0 ? file.slice(slash + 1) : file;
  return `${templateId}/${fileName}`;
};

const fillTemplate = (template: DetailTemplate, values: Record<string, string>): string => {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
};

const isRegion = (value: unknown): value is FacetBackedLayerRegion =>
  !!value && typeof value === "object" && !Array.isArray(value);

const profilePayload = (profile: Profile | ProfileArtifact): Profile =>
  "payload" in profile ? profile.payload : profile;

function resolveGenuiTemplate(profile: Profile | ProfileArtifact): ProfileTemplateArtifact {
  const payload = profilePayload(profile);
  const templateId = payload["profile-template"];
  if (typeof templateId !== "string" || templateId.length === 0) {
    throw new Error(`Profile '${payload.id}' must declare a profile-template`);
  }
  return resolveProfileTemplate(templateId);
}

function validateFacetBackedLayer(
  spec: unknown,
  config: FacetBackedLayerCheckConfig,
  taxonomy: InteractionTaxonomy
): AuthoringReport {
  const errors: { detail: string }[] = [];
  const warnings: { code: string; node?: string; detail: string }[] = [];
  const warn = (code: string, detail: string, node?: string) => warnings.push({ code, node, detail });

  const layerSpec = (spec ?? {}) as FacetBackedLayerSpec;
  const derived = executeSyncJsonataSteps({
    steps: config.steps,
    data: layerSpec as unknown as Json,
    returnKeys: ["kind", "regionNames"],
  });
  const kind = derived.kind as InteractionKind | undefined;
  if (!kind || !(kind in taxonomy)) {
    errors.push({ detail: fillTemplate(config.unknownInteractionDetailTemplate, { kind: String(kind) }) });
    return { ok: false, errors, warnings };
  }

  const facets = resolveFacets(layerSpec.source as InteractionSpec, taxonomy);
  const facetByName = new Map(facets.map((facet) => [facet.name, facet]));
  const regionNames = new Set(Array.isArray(derived.regionNames) ? derived.regionNames.map(String) : []);
  for (const facet of facets) {
    if (facet.required && !regionNames.has(facet.name)) {
      errors.push({ detail: fillTemplate(config.missingRequiredDetailTemplate, { facet: facet.name }) });
    }
  }
  for (const region of Array.isArray(layerSpec.regions) ? layerSpec.regions.filter(isRegion) : []) {
    if (typeof region.name !== "string") continue;
    const facet = facetByName.get(region.name);
    if (!facet) {
      warn(
        config.warnings.unknownRegion.code,
        fillTemplate(config.warnings.unknownRegion.detailTemplate, { region: region.name, kind }),
        region.name
      );
    }
    else if (facet.role !== region.role) {
      warn(
        config.warnings.roleMismatch.code,
        fillTemplate(config.warnings.roleMismatch.detailTemplate, {
          region: region.name,
          role: String(region.role),
          facetRole: facet.role,
        }),
        region.name
      );
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

function validateIntent(
  intent: unknown,
  interaction: InteractionSpec | undefined,
  taxonomy: InteractionTaxonomy,
  config: IntentSpecCheckConfig
): AuthoringReport {
  const shapeReport = runDeclarativeValidators(config.shapeValidators, (intent ?? null) as Json);
  if (!shapeReport.ok) {
    return { ok: false, errors: shapeReport.errors, warnings: [] };
  }

  const warnings: { code: string; node?: string; detail: string }[] = [];
  if (interaction) {
    const derived = executeSyncJsonataSteps({
      steps: config.targetSteps,
      data: ((intent ?? {}) as Partial<IntentSpec>) as unknown as Json,
      returnKeys: ["priorities", "constraints"],
    });
    const facetNames = new Set(resolveFacets(interaction, taxonomy).map((facet) => facet.name));
    const targets = [
      ...(Array.isArray(derived.priorities) ? derived.priorities : []),
      ...(Array.isArray(derived.constraints) ? derived.constraints : []),
    ].map(String);
    for (const name of targets) {
      if (!facetNames.has(name)) {
        warnings.push({
          code: config.warning.code,
          node: name,
          detail: fillTemplate(config.warning.detailTemplate, { name }),
        });
      }
    }
  }
  return { ok: true, errors: [], warnings };
}

export function createGenuiAuthoringRegistry(profile: Profile | ProfileArtifact): AuthoringRegistry {
  const payload = profilePayload(profile);
  const template = resolveGenuiTemplate(payload);
  const templateId = template.payload.id;
  const taxonomy = resolveNamedProfileTemplateFile(template, "taxonomy") as unknown as InteractionTaxonomy;
  const authoringChecks = resolveNamedProfileTemplateFile(template, "authoringChecks") as unknown as GenuiAuthoringChecksConfig;
  requiredProfileTemplateFile(template, "authoringChecks");

  const structuralValidators = buildStructuralValidatorsForTemplate(
    template,
    resolveProfileTemplateResource,
    structuralValidatorRefs
  );

  const describeInteractions = () => {
    return (Object.keys(taxonomy) as InteractionKind[]).map((kind) => ({
      interaction: kind,
      facets: taxonomy[kind].map((facet) => ({ name: facet.name, role: facet.role, required: facet.required })),
    }));
  };

  const layerSemanticChecksBySchema: Record<string, (spec: unknown) => AuthoringReport> = Object.fromEntries(
    authoringChecks.layerSemantics.map((config) => [
      schemaRefFromTemplateFile(templateId, config.schemaFile),
      (spec: unknown) => validateFacetBackedLayer(spec, config, taxonomy),
    ])
  );

  const validateLayerSemantics = (layer: LayerDefinition | undefined, spec: unknown): AuthoringReport => {
    const validator = layer?.schema ? layerSemanticChecksBySchema[layer.schema] : undefined;
    return validator ? validator(spec) : emptyReport();
  };

  return {
    describe: {
      "interaction-catalog": () => describeInteractions() as unknown as Json,
    },
    validators: structuralValidators,
    checks: {
      "layer-semantics": (args) => validateLayerSemantics(args.__layer as unknown as LayerDefinition | undefined, args.spec),
      "intent-spec": (args) => validateIntent(args.intent, args.interaction as unknown as InteractionSpec | undefined, taxonomy, authoringChecks.intentSpec),
    },
  };
}