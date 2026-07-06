/**
 * Step Machine — Public API
 *
 * Vendored subset (see ../README.md). The YAML/`fs` `loader.js` and the ajv
 * `schema-validator.js` re-exports are intentionally dropped — the provider path
 * builds `StepFlowConfig` from JSON directly and needs no external deps.
 */

export { StepMachine, createStepMachine } from './StepMachine.js';
export { applyStepResult, checkCircuitBreaker, computeStepInput, extractReturnData, createInitialState } from './reducer.js';
export type {
  StepFlowConfig,
  StepFlowSettings,
  StepConfig,
  TerminalStateConfig,
  RetryConfig,
  CircuitBreakerConfig,
  StepHandler,
  StepInput,
  StepContext,
  StepResult,
  StepMachineState,
  StepReducerResult,
  StepMachineOptions,
  StepMachineResult,
  StepMachineStore,
  StepEventType,
  StepEvent,
  StepEventListener,
} from './types.js';
