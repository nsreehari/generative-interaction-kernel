import type { BlueprintRuntime } from "@gik/controlface/blueprint";
import { InMemoryStateModel, type Json } from "@gik/kernel";
import {
  openSampleBlueprint,
  resolveSampleLaunchExternalContext,
  type BlueprintLaunchProfile,
} from "../../catalog/blueprint-catalog";
import { createNodeHostConfig } from "./service-host";
import { getNodeBlueprintCatalog } from "./catalog";

export interface OpenNodeLaunchResult {
  profile: BlueprintLaunchProfile;
  runtime: BlueprintRuntime;
  externalContext: Record<string, Json>;
}

export async function openNodeLaunch(
  profileId: string,
  externalContext?: Record<string, Json>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<OpenNodeLaunchResult> {
  const catalog = await getNodeBlueprintCatalog();
  const profile = catalog.launchProfiles.find((candidate) =>
    candidate.id === profileId || candidate.blueprint === profileId);
  if (!profile) throw new Error(`Unknown launch profile '${profileId}'.`);

  const resolvedExternalContext = {
    ...resolveSampleLaunchExternalContext(profile.blueprint),
    ...externalContext,
  };
  const runtime = openSampleBlueprint(
    profile.blueprint,
    resolvedExternalContext,
    createNodeHostConfig(environment),
  );
  return { profile, runtime, externalContext: resolvedExternalContext };
}

export function createRuntimeState(
  runtime: BlueprintRuntime,
  externalContext: Record<string, Json> = {},
  initialSeed: Record<string, Json> = {},
): InMemoryStateModel {
  const runtimeState = runtime.initialState ?? runtime.state;
  const state = new InMemoryStateModel([
    ...new Set([...Object.keys(runtimeState), ...Object.keys(initialSeed), "externalContext"]),
  ]);
  state.apply([
    ...Object.entries(runtimeState).map(([path, value]) => ({ op: "set" as const, path, value })),
    ...Object.entries(initialSeed).map(([path, value]) => ({ op: "set" as const, path, value })),
    { op: "set", path: "externalContext", value: structuredClone(externalContext) },
  ]);
  return state;
}