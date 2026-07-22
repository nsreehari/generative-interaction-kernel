import {
  compileScenarioBlueprint,
  resolveDemoEntry,
  validateDemoComposition,
  validateDemoCatalog,
  validateDemoTargetBundleContract,
  type DemoCatalog,
  type DemoTargetCatalogEntry,
  type OrganismDemoContract,
  type ScenarioBlueprintArtifact,
  type ScenarioPlan,
} from "./demo-runner";
import type { OrganismControlContract } from "./control-runtime";
import { unwrap, type DocumentMessage, type ManifestMessage } from "@gik/kernel";
import catalogArtifact from "../scenarios/catalog.json" with { type: "json" };
import { hasSampleBlueprint, openSampleBlueprint } from "./blueprints";

const scenarioArtifacts = import.meta.glob("../scenarios/*/scenario.json", {
  eager: true,
  import: "default",
}) as Record<string, ScenarioBlueprintArtifact>;
const scenarioPlans = new Map<string, ScenarioPlan>(
  Object.values(scenarioArtifacts).map((artifact) => {
    const plan = compileScenarioBlueprint(artifact);
    return [plan.id, plan];
  })
);
const bundleManifests = artifactsByBundleId(import.meta.glob("../bundles/*/manifest.json", {
  eager: true,
  import: "default",
}) as Record<string, ManifestMessage>);
const bundleDocuments = artifactsByBundleId(import.meta.glob("../bundles/*/document.json", {
  eager: true,
  import: "default",
}) as Record<string, DocumentMessage>);

const catalog = catalogArtifact as DemoCatalog;

export const demoScenariosJson = {
  catalog,
  scenarios: Object.values(scenarioArtifacts),
};

function artifactsByBundleId<T>(artifacts: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(artifacts).map(([path, artifact]) => {
    const bundleId = path.match(/\/bundles\/([^/]+)\//)?.[1];
    if (!bundleId) throw new Error(`Cannot derive Bundle id from '${path}'`);
    return [bundleId, artifact];
  }));
}

function demoContract(blueprintId: string, target: DemoTargetCatalogEntry): OrganismDemoContract {
  return {
    blueprintId,
    commands: target.commands.map(({ command }) => command),
    humanGates: target.humanGates,
    actors: target.actors,
    presentationPresets: target.presentationPresets,
    focusKinds: target.focusKinds,
    timelineSources: target.timelineSources,
  };
}

function controlContract(blueprintId: string, target: DemoTargetCatalogEntry): OrganismControlContract {
  return {
    blueprintId,
    commands: target.commands,
    humanGates: target.humanGates,
    observableOutcomes: target.observableOutcomes,
  };
}

export const demoCatalog = validateDemoCatalog(catalog, scenarioPlans);
for (const entry of demoCatalog.entries) {
  const runtime = hasSampleBlueprint(entry.targetBlueprintId)
    ? openSampleBlueprint(entry.targetBlueprintId)
    : undefined;
  const manifest = runtime?.manifest ?? bundleManifests.get(entry.targetBlueprintId);
  const document = runtime?.document ?? bundleDocuments.get(entry.targetBlueprintId);
  if (!manifest || !document) {
    throw new Error(`Demo '${entry.id}' references unknown Blueprint '${entry.targetBlueprintId}'`);
  }
  validateDemoTargetBundleContract(
    entry.targetBlueprintId,
    demoCatalog.targets[entry.targetBlueprintId],
    unwrap(manifest),
    unwrap(document)
  );
}

export function resolveDemoComposition(requestedId?: string | null, targetBlueprintId?: string | null): {
  entry: ReturnType<typeof resolveDemoEntry>;
  scenarioPlan: ScenarioPlan;
  demoContract: OrganismDemoContract;
  controlContract: OrganismControlContract;
} {
  const entry = resolveDemoEntry(demoCatalog, requestedId, targetBlueprintId);
  const scenarioPlan = scenarioPlans.get(entry.scenarioBlueprintId);
  if (!scenarioPlan) throw new Error(`Scenario '${entry.scenarioBlueprintId}' is not registered`);
  const target = demoCatalog.targets[entry.targetBlueprintId];
  if (!target) throw new Error(`No target contract is registered for Blueprint '${entry.targetBlueprintId}'`);
  const resolvedDemoContract = demoContract(entry.targetBlueprintId, target);
  const resolvedControlContract = controlContract(entry.targetBlueprintId, target);
  validateDemoComposition(entry, scenarioPlan, resolvedDemoContract);
  return {
    entry,
    scenarioPlan,
    demoContract: resolvedDemoContract,
    controlContract: resolvedControlContract,
  };
}
