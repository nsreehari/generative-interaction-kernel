import {
  projectCellRunState,
  type BlueprintRunState,
  type Json,
} from "../../kernel/src/index";

export const systemInputTokens = ["numSourcesRunning", "sourceErrors"] as const;
export type SystemInputToken = typeof systemInputTokens[number];

export interface SystemInputContext {
  blueprintRunState: BlueprintRunState;
  cellId: string;
}

export interface SystemInputDefinition {
  schema: Readonly<Record<string, Json>>;
  resolve(context: SystemInputContext): Json;
  runtimeExpression(cellId: string): string;
}

export const systemInputDefinitions: Readonly<Record<SystemInputToken, SystemInputDefinition>> = {
  numSourcesRunning: {
    schema: { type: "integer", minimum: 0 },
    resolve: ({ blueprintRunState, cellId }) => projectCellRunState(
      blueprintRunState.cells[cellId] ?? { sources: [] },
    ).numSourcesRunning,
    runtimeExpression: (cellId) => {
      const cell = `$lookup(blueprintRunState.cells, ${JSON.stringify(cellId)})`;
      return `$count((${cell}.sources)[lastRequestedToken != null and lastRequestedToken != lastCompletedToken])`;
    },
  },
  sourceErrors: {
    schema: {
      type: "object",
      additionalProperties: { type: "object" },
    },
    resolve: ({ blueprintRunState, cellId }) => projectCellRunState(
      blueprintRunState.cells[cellId] ?? { sources: [] },
    ).sourceErrors,
    runtimeExpression: (cellId) => {
      const cell = `$lookup(blueprintRunState.cells, ${JSON.stringify(cellId)})`;
      return `$merge(((${cell}.sources)[lastCompletionStatus.status = 'failure']).{id: lastCompletionStatus.error})`;
    },
  },
};

export function isSystemInputToken(value: string): value is SystemInputToken {
  return Object.prototype.hasOwnProperty.call(systemInputDefinitions, value);
}

export function resolveSystemInputs(
  tokens: readonly SystemInputToken[],
  context: SystemInputContext,
): Record<string, Json> {
  return Object.fromEntries(tokens.map((token) => [token, systemInputDefinitions[token].resolve(context)]));
}

export function systemInputRuntimeExpression(token: SystemInputToken, cellId: string): string {
  return systemInputDefinitions[token].runtimeExpression(cellId);
}
