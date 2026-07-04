// Layer 4 -> UI DSL: lower a Presentation Model (layout + regions) into a kernel document.
// A profile supplies a PresentationBinding — its "translation contract" — mapping each
// region to one of its own capabilities. Regions with no mapping fall back to the region
// name as the capability, which the kernel renders as a graceful fallback node (safe, and
// the mechanism by which a profile can target a facet it hasn't implemented yet).

import {
  assignFrom,
  node,
  type DocNode,
  type DocumentPayload,
  type Lowering,
  type NodeOptions,
} from "../../kernel/src/index";
import type { PresentationContext, PresentationCompiler, PresentationSpec } from "./presentation";
import { defaultPresentationCompiler } from "./presentation";
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

/** Build a Lowering (PresentationSpec -> kernel document) for one profile's binding. */
export function lowerPresentation(binding: PresentationBinding): Lowering<PresentationSpec> {
  return (p: PresentationSpec): DocumentPayload => {
    const src = p.source;
    const data = src.data ?? {};
    const children: DocNode[] = p.regions.map((region) => {
      const role = p.roles[region];
      // resolution order: explicit region override -> role binding -> region name (fallback).
      const capability =
        binding.regionCapability?.[region] ??
        (role ? binding.roleCapability?.[role] : undefined) ??
        region;
      const opts: NodeOptions = { props: { label: region } };
      if (data[region]) opts.read = { value: data[region] };
      const selectEvent = binding.regionSelectEvent?.[region];
      if (selectEvent) {
        opts.on = { [selectEvent]: [assignFrom(`${src.subject}.selected`, "$event.id")] };
      }
      return node(capability, `${region}-region`, opts);
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
 * The full upper pipeline as one call: Interaction + Context -> Presentation -> UI document.
 * Compose with the kernel's `lowerToDocument` to also get validate-before-commit.
 */
export function compileInteraction(
  spec: InteractionSpec,
  ctx: PresentationContext,
  binding: PresentationBinding,
  compiler: PresentationCompiler = defaultPresentationCompiler
): DocumentPayload {
  return lowerPresentation(binding)(compiler(spec, ctx));
}
