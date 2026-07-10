// Model-backed presentation planner (the "AI planner" seam, ADR-0018 Layer 4). The planner slot is
// a pure typed function (see `PresentationPlanner`); `defaultPresentationPlanner` is the deterministic
// reference that fills it today. This module adds the *model* seam in front of that slot: a live model
// (or, offline, a deterministic record/replay stand-in) proposes a Presentation DSL spec, the proposal
// is validated against the Presentation DSL schema at the boundary, and any error/invalid/absent plan
// falls back to the deterministic reference planner. The seam is therefore safe to fill with a real
// model without risking render-time surprises — and fully provable offline via a recorded cassette.

import {
  defaultPresentationPlanner,
  type PresentationContext,
  type PresentationPlanner,
  type PresentationSpec,
} from "./presentation";
import type { InteractionSpec } from "./interaction";
import { isValidPresentationSpec } from "./schema";

/**
 * A presentation-planning model: interaction + context -> a Presentation DSL spec. Async-capable so a
 * live model (a network/LLM call) can implement it; a record/replay model resolves synchronously.
 */
export interface PlannerModel {
  plan(spec: InteractionSpec, ctx: PresentationContext): PresentationSpec | Promise<PresentationSpec>;
}

/** An async planner: the shape `modelBackedPlanner` returns (a live model call is inherently async). */
export type AsyncPresentationPlanner = (
  spec: InteractionSpec,
  ctx: PresentationContext
) => Promise<PresentationSpec>;

/**
 * One recorded model interaction: the (interaction, context) input and the plan the model produced.
 * The cassette is the offline stand-in for a live model — deterministic, human-authorable, and checked
 * in as a test fixture. An entry whose `plan` is structurally invalid exercises the fallback path.
 */
export interface PlannerCassetteEntry {
  interaction: InteractionSpec;
  context: PresentationContext;
  plan: PresentationSpec;
}

/** Thrown by a replay model when no recorded entry matches the (interaction, context) key. */
export class PlannerModelMiss extends Error {
  constructor(readonly key: string) {
    super(`no recorded plan for key ${key}`);
    this.name = "PlannerModelMiss";
  }
}

/**
 * A canonical, order-stable key for a (interaction, context) pair. `PresentationContext` carries an
 * index signature, so object keys are sorted (recursively) — the cassette key is then deterministic
 * across runs and hosts, not dependent on property insertion order.
 */
export function recordKey(spec: InteractionSpec, ctx: PresentationContext): string {
  return canonicalStringify({ spec, ctx });
}

/** Deterministic JSON: recursively sorts object keys and drops `undefined` values. */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(",")}}`;
}

/**
 * A deterministic model that replays recorded plans from a cassette. It's the offline stand-in for a
 * live model: same input always yields the same recorded plan; an input with no recorded entry throws
 * {@link PlannerModelMiss}, which {@link modelBackedPlanner} treats as a fallback trigger.
 */
export function replayPlannerModel(entries: readonly PlannerCassetteEntry[]): PlannerModel {
  const byKey = new Map<string, PresentationSpec>();
  for (const e of entries) byKey.set(recordKey(e.interaction, e.context), e.plan);
  return {
    plan(spec, ctx) {
      const key = recordKey(spec, ctx);
      const hit = byKey.get(key);
      if (hit === undefined) throw new PlannerModelMiss(key);
      return hit;
    },
  };
}

/** Why a model-backed planner fell back to the deterministic reference planner. */
export type PlannerFallbackReason = "model-error" | "invalid-output";

export interface ModelBackedPlannerOptions {
  /** planner used when the model errors or returns an invalid plan (default: `defaultPresentationPlanner`). */
  fallback?: PresentationPlanner;
  /** validate the model's output against the Presentation DSL schema before accepting it (default: true). */
  validate?: boolean;
  /** observe fallbacks (telemetry/tests); called with the reason and the originating inputs. */
  onFallback?: (reason: PlannerFallbackReason, spec: InteractionSpec, ctx: PresentationContext) => void;
}

/**
 * Adapt a {@link PlannerModel} into an async planner: call the model, validate its structured output at
 * the boundary, and fall back to the deterministic reference planner on error or invalid output. This
 * keeps the model seam pluggable and safe — a hallucinated or malformed plan is caught here, not at
 * render time — and preserves the platform's language-neutral contract (the plan is checked against the
 * JSON schema, not against TypeScript types).
 */
export function modelBackedPlanner(
  model: PlannerModel,
  options: ModelBackedPlannerOptions = {}
): AsyncPresentationPlanner {
  const fallback = options.fallback ?? defaultPresentationPlanner;
  const validate = options.validate ?? true;
  return async (spec, ctx) => {
    let output: PresentationSpec;
    try {
      output = await model.plan(spec, ctx);
    } catch {
      options.onFallback?.("model-error", spec, ctx);
      return fallback(spec, ctx);
    }
    if (validate && !isValidPresentationSpec(output)) {
      options.onFallback?.("invalid-output", spec, ctx);
      return fallback(spec, ctx);
    }
    return output;
  };
}
