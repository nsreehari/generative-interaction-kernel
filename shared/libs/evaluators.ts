import { JsonataExpressionProvider, SyncJsonataExpressionProvider } from "../../kernel/src/providers";
import type { Json } from "../../kernel/src/types";

const syncJsonataEvaluator = new SyncJsonataExpressionProvider({ safe: true });
const asyncJsonataEvaluator = new JsonataExpressionProvider();

const toPlainJson = (value: Json): Json => JSON.parse(JSON.stringify(value ?? null)) as Json;

export function evalSyncJsonata(expr: string, data: Json, bindings: Record<string, Json> = {}): Json {
  return toPlainJson(syncJsonataEvaluator.eval(expr, data, bindings));
}

export async function evalAsyncJsonata(expr: string, data: Json, bindings: Record<string, Json> = {}): Promise<Json> {
  return toPlainJson(await asyncJsonataEvaluator.eval(expr, data, bindings));
}