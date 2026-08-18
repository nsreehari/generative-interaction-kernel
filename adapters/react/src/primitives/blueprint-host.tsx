import React from "react";
import {
  materializeBlueprint,
  HOSTED_BLUEPRINT_OUTPUT_EVENT,
  prepareBlueprintProgram,
  validateBlueprintArtifact,
  type BlueprintArtifact,
  type ExternalContext,
  type HostedBlueprintDefinition,
} from "@gik/blueprint";
import { unwrap, type Enveloped, type ExecutableProgramDefinition, type Json } from "@gik/kernel";
import { BlueprintController } from "../blueprint-controller";
import type { BlueprintControllerOptions } from "../blueprint-controller";
import type { ProjectionView, ProviderResolver } from "../registry";
import { bundleFromJson, type BundleNative } from "./bundle";
import {
  BundleRegistryProvider,
  createBundleRegistry,
  type BundleContextBindings,
} from "./bundle-registry";
import {
  BundleCompositionHost,
  type CompositionOrganism,
  type OrganismBridge,
} from "./bundle-composition-host";
import type { GenUIFileServices } from "./fileServices";
import {
  BLUEPRINT_HOST_PROVIDER,
  BlueprintHostRegistryProvider,
  BLUEPRINT_CAPABILITY,
  readBlueprintNodeDeclaration,
  PRESENTATION_FRAGMENT_CAPABILITY,
  resolveHostedBlueprintArtifact,
  resolveHostedBlueprint,
  type ReactBlueprintHostRegistry,
} from "./hosted-blueprint";

export { validateBlueprintArtifact, type BlueprintArtifact };

const EMPTY_COMPANIONS: CompositionOrganism[] = [];
const EMPTY_CONTEXTS: BundleContextBindings = {};

export interface BlueprintHostProps {
  blueprint: BlueprintArtifact;
  resolveLeavesProvider?: ProviderResolver;
  native?: BundleNative;
  companions?: CompositionOrganism[];
  contexts?: BundleContextBindings;
  fileServices?: GenUIFileServices;
  primaryBridge?: OrganismBridge;
  primaryInstanceId?: string | number;
  className?: string;
  style?: React.CSSProperties;
  externalContext?: ExternalContext;
  /** @deprecated Initial-state seed compatibility. Use externalContext for immutable inputs. */
  context?: Record<string, Json>;
  onTransition?: BlueprintControllerOptions["onTransition"];
  blueprintRegistry?: ReactBlueprintHostRegistry;
  renderHostedBlueprintLoading?: () => React.ReactNode;
}

export function BlueprintHost({
  blueprint,
  resolveLeavesProvider,
  native,
  companions = EMPTY_COMPANIONS,
  contexts = EMPTY_CONTEXTS,
  fileServices,
  primaryBridge,
  primaryInstanceId,
  className,
  style,
  externalContext,
  context,
  onTransition,
  blueprintRegistry,
  renderHostedBlueprintLoading,
}: BlueprintHostProps): React.ReactElement {
  const registry = React.useMemo(() => createBundleRegistry(), []);
  const parentBlueprintId = blueprint.payload.id;
  const parentInstanceId = primaryInstanceId === undefined
    ? parentBlueprintId
    : `${parentBlueprintId}:${primaryInstanceId}`;
  const materializedBlueprint = React.useMemo(
    () => materializeBlueprint({
      blueprint,
      externalContext,
      resolveBlueprint: (ref, childContext) => resolveHostedBlueprintArtifact(ref, blueprintRegistry, {
        ...childContext,
        parentInstanceId,
      }),
    }),
    [blueprint, externalContext, blueprintRegistry, parentInstanceId],
  );
  const prepared = React.useMemo(
    () => context
      ? prepareBlueprintProgram(materializedBlueprint.payload.terminalBlueprint, { context })
      : {
          blueprint: materializedBlueprint.payload.terminalBlueprint,
          vocabulary: materializedBlueprint.payload.vocabulary,
          program: materializedBlueprint.payload.program,
          initialState: materializedBlueprint.payload.initialState,
        },
    [context, materializedBlueprint],
  );
  const bundle = React.useMemo(
    () => bundleFromJson({
      vocabulary: prepared.vocabulary,
      program: prepared.program,
      state: prepared.initialState,
    }, native),
    [prepared, native],
  );
  const source = React.useMemo(
    () => new BlueprintController(blueprint, {
      externalContext,
      materializedBlueprint,
      context,
      contexts,
      native,
      onTransition,
    }),
    [blueprint, externalContext, materializedBlueprint, context, contexts, native, onTransition],
  );
  const blueprintId = prepared.blueprint.payload.id;
  const primaryInstanceIdResolved = parentInstanceId;
  const HostedBlueprint = React.useMemo<ProjectionView>(
    () => createHostedBlueprintProjection({
      registry: blueprintRegistry,
      parentBlueprintId: blueprintId,
      parentInstanceId: primaryInstanceIdResolved,
      resolveLeavesProvider,
      contexts,
      fileServices,
      onTransition,
      renderHostedBlueprintLoading,
    }),
    [blueprintRegistry, blueprintId, primaryInstanceIdResolved, resolveLeavesProvider, contexts, fileServices, onTransition, renderHostedBlueprintLoading],
  );
  const PresentationFragment = React.useMemo<ProjectionView>(
    () => ({ children }) => React.createElement(React.Fragment, null, children),
    [],
  );
  const hostResolveProvider = React.useMemo<ProviderResolver>(
    () => (from) => from === BLUEPRINT_HOST_PROVIDER
      ? {
          [BLUEPRINT_CAPABILITY]: HostedBlueprint,
          [PRESENTATION_FRAGMENT_CAPABILITY]: PresentationFragment,
        }
      : resolveLeavesProvider?.(from),
    [HostedBlueprint, PresentationFragment, resolveLeavesProvider],
  );
  const primary = React.useMemo<CompositionOrganism>(
    () => ({
      instanceId: primaryInstanceIdResolved,
      bundle,
      source,
      bridge: primaryBridge,
      structuralViews: {
        [BLUEPRINT_CAPABILITY]: HostedBlueprint,
        [PRESENTATION_FRAGMENT_CAPABILITY]: PresentationFragment,
      },
    }),
    [primaryInstanceIdResolved, bundle, source, primaryBridge, HostedBlueprint, PresentationFragment],
  );

  return (
    <BlueprintHostRegistryProvider registry={blueprintRegistry}>
      <BundleRegistryProvider registry={registry} resolveProvider={hostResolveProvider}>
        <BundleCompositionHost
          primary={primary}
          companions={companions}
          contexts={contexts}
          fileServices={fileServices}
          className={className}
          style={style}
        />
      </BundleRegistryProvider>
    </BlueprintHostRegistryProvider>
  );
}

export function createHostedBlueprintProjection({
  registry,
  parentBlueprintId,
  parentInstanceId,
  resolveLeavesProvider,
  contexts,
  fileServices,
  onTransition,
  renderHostedBlueprint,
  renderHostedBlueprintLoading,
}: {
  registry?: ReactBlueprintHostRegistry;
  parentBlueprintId: string;
  parentInstanceId: string;
  resolveLeavesProvider?: ProviderResolver;
  contexts: BundleContextBindings;
  fileServices?: GenUIFileServices;
  onTransition?: BlueprintControllerOptions["onTransition"];
  renderHostedBlueprint?: (props: BlueprintHostProps) => React.ReactElement;
  renderHostedBlueprintLoading?: () => React.ReactNode;
}): ProjectionView {
  return function HostedBlueprintProjection({ node, emit }) {
    const declarationInput = node.props.blueprint ?? node.props.hostedBlueprint;
    const declaration = readBlueprintNodeDeclaration(node.props);
    const isEmptyDeclaration = declarationInput === undefined || declarationInput === null;
    const [resolution, setResolution] = React.useState<HostedBlueprintDefinition<BundleNative> | null>(null);
    const [error, setError] = React.useState<Error | null>(null);
    const [showLoading, setShowLoading] = React.useState(false);
    const inputSignature = JSON.stringify(node.props);

    React.useEffect(() => {
      let active = true;
      setResolution(null);
      setError(null);
      setShowLoading(false);
      if (!declaration) {
        if (!isEmptyDeclaration) {
          setError(new Error(`Hosted Blueprint cell '${node.id}' has an invalid child declaration`));
        }
        return () => { active = false; };
      }
      void resolveHostedBlueprint(declaration, registry, {
        parentBlueprintId,
        parentInstanceId,
        cellId: node.id,
      }).then(
        (next) => { if (active) setResolution(next); },
        (reason: unknown) => { if (active) setError(reason instanceof Error ? reason : new Error(String(reason))); },
      );
      return () => { active = false; };
    }, [declaration?.$ref, declaration?.inline, isEmptyDeclaration, node.id]);

    React.useEffect(() => {
      if (isEmptyDeclaration || resolution || error) {
        setShowLoading(false);
        return;
      }
      const timeout = setTimeout(() => setShowLoading(true), 1000);
      return () => clearTimeout(timeout);
    }, [resolution, error, declaration?.$ref, declaration?.inline, isEmptyDeclaration, node.id]);

    if (isEmptyDeclaration) return null;
    if (error) {
      return <div role="alert" data-hosted-blueprint-error>{error.message}</div>;
    }
    if (!resolution) {
      if (!showLoading) return <div aria-busy="true" data-hosted-blueprint-loading hidden />;
      return (
        <div aria-busy="true" role="status" data-hosted-blueprint-loading>
          {renderHostedBlueprintLoading?.() ?? "Loading view\u00a0\u2026"}
        </div>
      );
    }

    const { blueprint: _blueprint, hostedBlueprint: _hostedBlueprint, ...inputs } = node.props;
    const childProps: BlueprintHostProps = {
      blueprint: resolution.blueprint,
      native: resolution.native,
      blueprintRegistry: registry,
      resolveLeavesProvider,
      contexts,
      fileServices,
      context: { initialSeed: inputs },
      primaryInstanceId: `${parentInstanceId}/cells/${node.id}`,
      onTransition: (event, result) => {
        onTransition?.(event, result);
        if (result.outputs && Object.keys(result.outputs).length > 0) {
          void emit(HOSTED_BLUEPRINT_OUTPUT_EVENT, result.outputs);
        }
      },
      renderHostedBlueprintLoading,
    };
    return renderHostedBlueprint
      ? renderHostedBlueprint(childProps)
      : <BlueprintHost key={`${resolution.reference.id}:${resolution.reference.version ?? "host-selected"}:${inputSignature}`} {...childProps} />;
  };
}