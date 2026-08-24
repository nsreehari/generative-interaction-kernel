// Host-controlled placement of a Blueprint's explicitly exported presentation regions.
//
// One Blueprint instance, one controller, one journal, one effect dispatcher, one lifecycle -- and
// several React locations. `BlueprintRegionRuntimeProvider` runs the single organism exactly the way
// `CompositionOrganismRuntime` runs it for a single-root `BlueprintHost` (same controller memoization,
// same shared-context sync, same bridge wrap, same `useGenUI` start/stop lifecycle), but instead of
// rendering the resolved tree at one place it publishes the tree, the shared emit, and the bundle
// registry so each `<BlueprintRegion name="..." />` can render just its own exported subtree wherever
// the application shell puts it. Mounting a region therefore never instantiates a second Blueprint,
// controller, or bundle -- the region mount is a pure placement of an already-running projection.
//
// A slot is internal Blueprint-owned topology; an exported region is the explicit contract a host may
// address. Regions come from the TERMINAL Blueprint of the current materialization, so changing the
// provider's `externalContext` re-materializes (existing `BlueprintHost` semantics) and re-publishes
// the region set of the newly selected terminal representation.

import React from "react";
import {
  findExportedPresentationRegion,
  listExportedPresentationRegions,
  type BlueprintArtifact,
  type ExportedPresentationRegion,
} from "@gik/blueprint";
import type { ResolvedNode } from "@gik/kernel";
import type { ComponentRegistry } from "../registry";
import { renderNode, type EmitFn } from "../render";
import { useGenUI, type GenUISource } from "../useGenUI";
import { loadBundle } from "./bundle";
import type { CompositionOrganism } from "./bundle-composition-host";
import {
  BundleContextsProvider,
  useBundleContextSync,
  useProjectionProviderResolver,
  type BundleContextBindings,
} from "./bundle-registry";
import { GenUIFileServicesProvider, type GenUIFileServices } from "./fileServices";
import { buildBundleRegistry } from "./registry";

/** Every host-facing region failure: an unknown name, a repeated mount, or a mount placed outside the
 * provider that owns the running Blueprint. Deliberately thrown rather than rendered, because each one
 * is a host wiring mistake with exactly one correct fix, not a runtime condition to degrade around. */
export class BlueprintRegionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlueprintRegionError";
  }
}

/** Reported when a Blueprint declares a region `required` and no host mount claimed it. */
export type MissingRequiredRegionsReporter = (regions: readonly string[], message: string) => void;

/** The one running Blueprint every region mount under a provider shares. */
export interface BlueprintRegionRuntime {
  /** Exported regions of the terminal Blueprint selected for the provider's external context. */
  readonly regions: readonly ExportedPresentationRegion[];
  /** The single resolved projection tree; every region renders a subtree of exactly this tree. */
  readonly tree: ResolvedNode | null;
  /** The shared controller's emit -- every mounted region dispatches through it. */
  readonly emit: EmitFn;
  readonly registry: ComponentRegistry;
  /** Claims exclusive placement of one region name; `null` when it is already mounted elsewhere. */
  readonly claimRegion: (name: string) => (() => void) | null;
}

const BlueprintRegionRuntimeContext = React.createContext<BlueprintRegionRuntime | null>(null);

/** Scopes region mounts to the Blueprint instance that published them. A nested hosted Blueprint
 * renders inside its parent's React tree, so without this boundary a region mount inside a child would
 * silently resolve the PARENT's runtime. Cross-instance forwarding is a deliberate non-goal. */
export function BlueprintRegionBoundary({ children }: { children: React.ReactNode }): React.ReactElement {
  return <BlueprintRegionRuntimeContext.Provider value={null}>{children}</BlueprintRegionRuntimeContext.Provider>;
}

function useBlueprintRegionRuntime(usage: string): BlueprintRegionRuntime {
  const runtime = React.useContext(BlueprintRegionRuntimeContext);
  if (!runtime) {
    throw new BlueprintRegionError(`${usage} must be rendered inside the BlueprintProvider that owns the Blueprint runtime`);
  }
  return runtime;
}

/** Discover what the running Blueprint exports, so a shell can decide where to place each region and
 * which optional ones it mounts at all. */
export function useBlueprintRegions(): readonly ExportedPresentationRegion[] {
  return useBlueprintRegionRuntime("useBlueprintRegions()").regions;
}

function findSlotNode(node: ResolvedNode, slot: string): ResolvedNode | null {
  if (node.id === slot) return node;
  for (const child of node.children) {
    const found = findSlotNode(child, slot);
    if (found) return found;
  }
  return null;
}

/** Headless hosted-Blueprint Cells are compiled as siblings of the presentation root so they execute
 * independently of presentation. Region mounts render only slot subtrees, so the provider mounts
 * those siblings once while leaving all host-visible placement to `<BlueprintRegion>`. */
function headlessNodes(tree: ResolvedNode | null, presentationRoot: string): readonly ResolvedNode[] {
  if (!tree || tree.id === presentationRoot) return [];
  if (!tree.children.some((child) => child.id === presentationRoot)) return [];
  return tree.children.filter((child) => child.id !== presentationRoot);
}

/**
 * Places one exported region of the surrounding provider's Blueprint. Renders only that region's own
 * projection subtree -- an unmounted optional region never instantiates its views at all -- and never
 * accepts an `externalContext` of its own, since every region of one apparent instance must represent
 * the same materialization the provider selected.
 */
export function BlueprintRegion({ name }: { name: string }): React.ReactElement | null {
  const runtime = useBlueprintRegionRuntime(`<BlueprintRegion name="${name}">`);
  const region = findExportedPresentationRegion(runtime.regions, name);
  const claimRegion = runtime.claimRegion;
  const [conflict, setConflict] = React.useState(false);

  React.useEffect(() => {
    if (!region) return;
    const release = claimRegion(name);
    if (!release) {
      setConflict(true);
      return;
    }
    setConflict(false);
    return () => release();
  }, [claimRegion, name, region]);

  if (!region) {
    const exported = runtime.regions.map((entry) => entry.name).join(", ");
    throw new BlueprintRegionError(
      `Blueprint does not export presentation region '${name}'. Exported regions: ${exported === "" ? "(none)" : exported}`,
    );
  }
  if (conflict) {
    throw new BlueprintRegionError(
      `Blueprint presentation region '${name}' is already mounted; a region may be mounted at most once`,
    );
  }
  const node = runtime.tree ? findSlotNode(runtime.tree, region.slot) : null;
  if (!node) return null;
  return <>{renderNode(node, runtime.registry, runtime.emit)}</>;
}

/** Exclusive, first-claim-wins placement of region names, plus the mounted set the required-region
 * diagnostic reads. Held in a ref so a provider effect (which runs after every child effect in the
 * same commit) sees claims made in that commit, with state used only to re-run that diagnostic. */
function useRegionClaims(): {
  claimRegion: (name: string) => (() => void) | null;
  isMounted: (name: string) => boolean;
  mountedVersion: number;
} {
  const held = React.useRef<Map<string, symbol>>(new Map());
  const [mountedVersion, setMountedVersion] = React.useState(0);
  const claimRegion = React.useCallback((name: string) => {
    if (held.current.has(name)) return null;
    const token = Symbol(name);
    held.current.set(name, token);
    setMountedVersion((version) => version + 1);
    return () => {
      if (held.current.get(name) !== token) return;
      held.current.delete(name);
      setMountedVersion((version) => version + 1);
    };
  }, []);
  const isMounted = React.useCallback((name: string) => held.current.has(name), []);
  return { claimRegion, isMounted, mountedVersion };
}

function defaultMissingRequiredRegions(_regions: readonly string[], message: string): void {
  console.warn(message);
}

/**
 * Runs one Blueprint organism and publishes it to every region mount below. Deliberately mirrors
 * `CompositionOrganismRuntime` rather than wrapping it: the difference is only WHERE the resolved tree
 * is rendered, so both hosts keep identical controller, shared-context, bridge, and lifecycle
 * semantics. Shared by the in-memory and durable providers, which makes their region parity structural
 * rather than a duplicated implementation.
 */
export function BlueprintRegionRuntimeProvider({
  organism,
  blueprint,
  contexts,
  fileServices,
  onMissingRequiredRegions = defaultMissingRequiredRegions,
  children,
}: {
  organism: CompositionOrganism;
  /** The terminal Blueprint of the current materialization -- the only legitimate source of regions. */
  blueprint: BlueprintArtifact;
  contexts: BundleContextBindings;
  fileServices?: GenUIFileServices;
  onMissingRequiredRegions?: MissingRequiredRegionsReporter;
  children: React.ReactNode;
}): React.ReactElement {
  const resolveProvider = useProjectionProviderResolver();
  const controller = React.useMemo<GenUISource>(
    () => organism.source ?? loadBundle(organism.bundle, { contexts, wrapOrchestrator: organism.wrapOrchestrator }),
    [organism.source] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useBundleContextSync(controller, contexts);
  const registry = React.useMemo(
    () => buildBundleRegistry(organism.bundle, resolveProvider ?? undefined, organism.structuralViews),
    [organism.bundle, resolveProvider, organism.structuralViews],
  );
  const source = React.useMemo(
    () => organism.bridge?.wrapSource?.(controller, contexts) ?? controller,
    [controller] // eslint-disable-line react-hooks/exhaustive-deps
  );
  React.useEffect(() => {
    const cleanup = organism.bridge?.connect?.(controller, contexts);
    return typeof cleanup === "function" ? cleanup : undefined;
  }, [controller]); // eslint-disable-line react-hooks/exhaustive-deps
  const { tree, emit } = useGenUI(source);
  const emitRef = React.useRef(emit);
  emitRef.current = emit;
  // A stable emit identity keeps the published runtime value from churning on every provider render;
  // the ref always points at the current controller's emit, so dispatch stays shared and current.
  const stableEmit = React.useCallback<EmitFn>(
    (node, name, payload, actorId) => emitRef.current(node, name, payload, actorId),
    [],
  );
  const regions = React.useMemo(() => listExportedPresentationRegions(blueprint), [blueprint]);
  const presentationRoot = blueprint.payload.presentation?.root;
  const headless = React.useMemo(
    () => presentationRoot ? headlessNodes(tree, presentationRoot) : [],
    [tree, presentationRoot],
  );
  const { claimRegion, isMounted, mountedVersion } = useRegionClaims();

  const blueprintId = blueprint.payload.id;
  React.useEffect(() => {
    const missing = regions.filter((region) => region.required && !isMounted(region.name)).map((region) => region.name);
    if (missing.length === 0) return;
    onMissingRequiredRegions(
      missing,
      `Blueprint '${blueprintId}' requires presentation region(s) ${missing.join(", ")} to be mounted with <BlueprintRegion name="..."> under its BlueprintProvider`,
    );
  }, [regions, isMounted, mountedVersion, blueprintId, onMissingRequiredRegions]);

  const value = React.useMemo<BlueprintRegionRuntime>(
    () => ({ regions, tree, emit: stableEmit, registry, claimRegion }),
    [regions, tree, stableEmit, registry, claimRegion],
  );
  return (
    <BundleContextsProvider contexts={contexts}>
      <GenUIFileServicesProvider services={fileServices}>
        <BlueprintRegionRuntimeContext.Provider value={value}>
          {children}
          {headless.length > 0 ? (
            <div hidden data-blueprint-headless-cells>
              {headless.map((node) => renderNode(node, registry, stableEmit))}
            </div>
          ) : null}
        </BlueprintRegionRuntimeContext.Provider>
      </GenUIFileServicesProvider>
    </BundleContextsProvider>
  );
}
