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
): InMemoryStateModel {
  const state = new InMemoryStateModel([...Object.keys(runtime.state), "externalContext"]);
  state.apply([
    ...Object.entries(runtime.state).map(([path, value]) => ({ op: "set" as const, path, value })),
    { op: "set", path: "externalContext", value: structuredClone(externalContext) },
  ]);
  return state;
}