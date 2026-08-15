import {
  JsonataExpressionProvider,
  SyncJsonataExpressionProvider,
  validateJsonataExpression as validateJsonataExpressionKernel,
  type Json,
} from "../../kernel/src/index";

const syncJsonataEvaluator = new SyncJsonataExpressionProvider({ safe: true });
const fullSyncJsonataEvaluator = new SyncJsonataExpressionProvider();
const asyncJsonataEvaluator = new JsonataExpressionProvider();

const toPlainJson = (value: Json): Json => JSON.parse(JSON.stringify(value ?? null)) as Json;

export type SyncJsonataStep = {
  expr: string;
  writeTo: string;
};

export const syncJsonataStepSchema = {
  type: "object",
  properties: {
    expr: { type: "string" },
    writeTo: { type: "string" },
  },
  required: ["expr", "writeTo"],
  additionalProperties: false,
} as const;

export type ExecuteSyncJsonataStepsInput = {
  steps: readonly SyncJsonataStep[];
  data: Json;
  bindings?: Record<string, Json>;
  returnKeys?: readonly string[];
};

export type ExecuteSyncJsonataStepsOutput = Record<string, Json>;

export const executeSyncJsonataStepsInputSchema = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: syncJsonataStepSchema,
    },
    data: {},
    bindings: {
      type: "object",
      additionalProperties: true,
    },
    returnKeys: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["steps", "data"],
  additionalProperties: false,
} as const;

export const executeSyncJsonataStepsOutputSchema = {
  type: "object",
  additionalProperties: true,
} as const;

export function evalSyncJsonata(expr: string, data: Json, bindings: Record<string, Json> = {}): Json {
  return toPlainJson(syncJsonataEvaluator.eval(expr, data, bindings));
}

export function evalFullSyncJsonata(expr: string, data: Json, bindings: Record<string, Json> = {}): Json {
  return toPlainJson(fullSyncJsonataEvaluator.eval(expr, data, bindings));
}

export function executeSyncJsonataSteps(input: ExecuteSyncJsonataStepsInput): ExecuteSyncJsonataStepsOutput {
  const env: Record<string, Json> = { ...(input.bindings ?? {}) };

  for (const step of input.steps) {
    env[step.writeTo] = evalSyncJsonata(step.expr, input.data, env);
  }

  if (!input.returnKeys || input.returnKeys.length === 0) {
    return env;
  }

  const output: ExecuteSyncJsonataStepsOutput = {};
  for (const key of input.returnKeys) {
    if (key in env) {
      output[key] = env[key];
    }
  }
  return output;
}

export async function evalAsyncJsonata(expr: string, data: Json, bindings: Record<string, Json> = {}): Promise<Json> {
  return toPlainJson(await asyncJsonataEvaluator.eval(expr, data, bindings));
}

export type JsonataExpressionValidationMode = "full" | "safe";

export type ValidateJsonataExpressionOptions = {
  mode?: JsonataExpressionValidationMode;
};

export type ValidateJsonataExpressionResult = {
  ok: boolean;
  error?: string;
};

export function validateJsonataExpression(
  expr: string,
  options: ValidateJsonataExpressionOptions = {}
): ValidateJsonataExpressionResult {
  return validateJsonataExpressionKernel(expr, { safe: options.mode === "safe" });
}