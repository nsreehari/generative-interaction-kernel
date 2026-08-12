import {
  type BlueprintHostRegistry,
} from "@gik/blueprint";
import type { BundleNative } from "./bundle";
import React from "react";

export const BLUEPRINT_HOST_PROVIDER = "blueprint-host";
export {
  HOSTED_BLUEPRINT_CAPABILITY,
  PRESENTATION_FRAGMENT_CAPABILITY,
  readHostedBlueprintDeclaration,
  resolveHostedBlueprint,
  resolveHostedBlueprintArtifact,
} from "@gik/blueprint";

export type ReactBlueprintHostRegistry = BlueprintHostRegistry<BundleNative>;

const BlueprintHostRegistryContext = React.createContext<ReactBlueprintHostRegistry | undefined>(undefined);

export function BlueprintHostRegistryProvider({
  registry,
  children,
}: {
  registry?: ReactBlueprintHostRegistry;
  children: React.ReactNode;
}): React.ReactElement {
  return React.createElement(BlueprintHostRegistryContext.Provider, { value: registry }, children);
}

export function useBlueprintHostRegistry(): ReactBlueprintHostRegistry | undefined {
  return React.useContext(BlueprintHostRegistryContext);
}