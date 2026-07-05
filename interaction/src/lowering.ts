// Layer 4 -> UI DSL: lower a Presentation Model (layout + regions) into a kernel document.
// A profile supplies a PresentationBinding — its "translation contract" — mapping each
// region to one of its own capabilities. Regions with no mapping fall back to the region
// name as the capability, which the kernel renders as a graceful fallback node (safe, and
// the mechanism by which a profile can target a facet it hasn't implemented yet).

import {
  assignFrom,
  node,
  type CapabilityDescriptor,
  type DocNode,
  type DocumentPayload,
  type Json,
  type Lowering,
  type NodeOptions,
} from "../../kernel/src/index";
import type { PresentationContext, PresentationPlanner, PresentationSpec } from "./presentation";
import { defaultPresentationPlanner } from "./presentation";
import type { FacetRole, InteractionSpec } from "./interaction";

/** A profile's map from presentation regions to its own kernel capabilities. */
export interface PresentationBinding {
  /** capability that groups the regions (e.g. "board"). */
  container: string;
  /** facet role -> capability: bind once per role (the scalable default). */
  roleCapability?: Partial<Record<FacetRole, string>>;
  /** region -> concrete capability: overrides roleCapability for a specific region. */
  regionCapability?: Record<string, string>;
  /** region -> the select event its capability emits, wired to write `${subject}.selected`. */
  regionSelectEvent?: Record<string, string>;
}

/**
 * The Presentation *Compiler*: lower a Presentation DSL (layout + enriched regions) into a kernel
 * document, using a profile's {@link PresentationBinding}. Each region's hierarchy/disclosure/
 * presentation-type ride through as node props so a renderer can honor them.
 *
 * `capabilities` (the manifest's capability descriptors) lets each region's bound data land on the
 * prop that capability actually reads (`CapabilityDescriptor.dataProp`, e.g. metric -> "value",
 * table -> "rows"). Omit it and the read edge defaults to the `value` prop.
 */
export function lowerPresentation(
  binding: PresentationBinding,
  capabilities?: Record<string, CapabilityDescriptor>
): Lowering<PresentationSpec> {
  return (p: PresentationSpec): DocumentPayload => {
    const src = p.source;
    const data = src.data ?? {};
    const children: DocNode[] = p.regions.map((region) => {
      // resolution order: explicit region override -> role binding -> region name (fallback).
      const capability =
        binding.regionCapability?.[region.name] ??
        binding.roleCapability?.[region.role] ??
        region.name;
      const props: Record<string, Json> = {
        // authored static config first; platform-owned placement fields win on any collision.
        ...(region.props ?? {}),
        label: region.name,
        priority: region.priority,
        disclosure: region.disclosure,
      };
      if (region.presentation) props.presentation = region.presentation;
      const opts: NodeOptions = { props };
      if (data[region.name]) {
        // bind onto the prop this capability reads (generic per capability; defaults to "value").
        const dataProp = capabilities?.[capability]?.dataProp ?? "value";
        opts.read = { [dataProp]: data[region.name] };
      }
      const selectEvent = binding.regionSelectEvent?.[region.name];
      if (selectEvent) {
        opts.on = { [selectEvent]: [assignFrom(`${src.subject}.selected`, "$event.id")] };
      }
      return node(capability, `${region.name}-region`, opts);
    });
    return {
      root: node(binding.container, src.interaction, {
        props: { title: src.subject, layout: p.layout, arrangement: p.arrangement },
        children,
      }),
    };
  };
}

/**
 * The full upper pipeline as one call: Interaction + Context -> Presentation DSL (planner) ->
 * UI document (compiler). Compose with the kernel's `lowerToDocument` to also get
 * validate-before-commit. Swap `planner` to drop in an AI presentation planner.
 */
export function compileInteraction(
  spec: InteractionSpec,
  ctx: PresentationContext,
  binding: PresentationBinding,
  planner: PresentationPlanner = defaultPresentationPlanner,
  capabilities?: Record<string, CapabilityDescriptor>
): DocumentPayload {
  return lowerPresentation(binding, capabilities)(planner(spec, ctx));
}
