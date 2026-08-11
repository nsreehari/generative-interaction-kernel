import type { BlueprintRuntime } from "@gik/controlface/blueprint";
import { InMemoryStateModel, type Json } from "@gik/kernel";
import {
  openSampleBlueprint,
  type BlueprintLaunchProfile,
} from "../../catalog/blueprint-catalog";
import { createNodeHostConfig } from "./service-host";
import { getNodeBlueprintCatalog } from "./catalog";

export interface OpenNodeLaunchResult {
  profile: BlueprintLaunchProfile;
  runtime: BlueprintRuntime;
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

  const runtime = openSampleBlueprint(
    profile.blueprint,
    externalContext,
    createNodeHostConfig(environment),
  );
  return { profile, runtime };
}

export function createRuntimeState(runtime: BlueprintRuntime): InMemoryStateModel {
  const state = new InMemoryStateModel(Object.keys(runtime.state));
  state.apply(Object.entries(runtime.state).map(([path, value]) => ({ op: "set" as const, path, value })));
  return state;
}