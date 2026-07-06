// Interpreter: resolves a document node into a ResolvedNode tree.
// Order: gate -> capability -> props(read) -> children.

import type { DocNode, Json, ResolvedNode, TraceSink } from "./types";
import type { CapabilityRegistry, ExpressionProvider, StateModel } from "./providers";

export interface InterpretContext {
  store: StateModel;
  expr: ExpressionProvider;
  /**
   * Provider for *predicate* positions (the visibility gate). Agent-authored and adversarial,
   * so the platform defaults it to the safe subset. Falls back to {@link expr} when unset.
   */
  predicateExpr?: ExpressionProvider;
  registry: CapabilityRegistry;
  sink?: TraceSink;
}

function truthy(v: Json): boolean {
  return v !== null && v !== undefined && v !== false;
}

export async function resolveNode(node: DocNode, ctx: InterpretContext): Promise<ResolvedNode> {
  const data = ctx.store.snapshot();

  let visible = true;
  if (node.edges?.gate) {
    visible = truthy(await (ctx.predicateExpr ?? ctx.expr).eval(node.edges.gate, data));
  }

  const props: Record<string, Json> = { ...(node.props ?? {}) };
  if (node.edges?.read) {
    for (const [prop, path] of Object.entries(node.edges.read)) {
      props[prop] = ctx.store.get(path);
    }
  }
  if (node.edges?.readExpr) {
    // Value position (shaped read): full provider, like derive / assign-from — NOT the safe
    // predicate subset the gate uses. Applied after `read`, so an expression may reshape a
    // plain-read prop of the same name.
    for (const [prop, expr] of Object.entries(node.edges.readExpr)) {
      props[prop] = await ctx.expr.eval(expr, data);
    }
  }

  const fallback = !ctx.registry.has(node.capability);
  ctx.sink?.({
    event: fallback ? "fallback" : "resolve",
    node: node.id,
    detail: { capability: node.capability },
  });

  const children: ResolvedNode[] = [];
  for (const c of node.edges?.children ?? []) {
    children.push(await resolveNode(c, ctx));
  }

  return {
    capability: node.capability,
    id: node.id,
    props,
    visible,
    fallback,
    children,
  };
}
