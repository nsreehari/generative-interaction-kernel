// Interpreter: resolves a document node into a ResolvedNode tree.
// Order: gate -> capability -> props(read) -> children.

import type { DocNode, Json, ResolvedNode, TraceSink } from "./types";
import type { CapabilityRegistry, ExpressionProvider, StateModel } from "./providers";

export interface InterpretContext {
  store: StateModel;
  expr: ExpressionProvider;
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
    visible = truthy(await ctx.expr.eval(node.edges.gate, data));
  }

  const props: Record<string, Json> = { ...(node.props ?? {}) };
  if (node.edges?.read) {
    for (const [prop, path] of Object.entries(node.edges.read)) {
      props[prop] = ctx.store.get(path);
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
