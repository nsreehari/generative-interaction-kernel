import type { DurableProvider, TransitionRefs } from "../../../packages/durable-runtime/src/contracts";
import { validateJsonValue, type Json, type ServiceDeclaration } from "../../../kernel/src/index";

export type ServiceConfigurations = Record<string, Record<string, Json>>;
export interface ServiceSettings {
  generation: number;
  configurations: ServiceConfigurations;
  activeConfigurations: ServiceConfigurations;
  applied: string[];
}
export class ServiceSettingsError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ServiceSettingsError";
  }
}
export const serviceSettingsSchema = {
  type: "object", additionalProperties: false, required: ["generation", "configurations", "activeConfigurations", "applied"],
  properties: {
    generation: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    configurations: { type: "object", maxProperties: 20, additionalProperties: {
      type: "object", maxProperties: 20, additionalProperties: { type: ["string", "number", "boolean", "null"], maxLength: 2048 },
    } },
    activeConfigurations: { type: "object", maxProperties: 20, additionalProperties: {
      type: "object", maxProperties: 20, additionalProperties: { type: ["string", "number", "boolean", "null"], maxLength: 2048 },
    } },
    applied: { type: "array", maxItems: 100, items: { type: "string", maxLength: 100 } },
  },
};

/** Returns runtime declarations; the authored Blueprint remains unchanged. */
export function configuredServiceDeclarations(declarations: Record<string, ServiceDeclaration>, configurations: ServiceConfigurations = {}) {
  const result = structuredClone(declarations);
  for (const [id, config] of Object.entries(configurations)) {
    const declaration = Object.hasOwn(result, id) ? result[id] : undefined;
    if (!declaration || !("kind" in declaration) || !declaration.kind)
      throw new ServiceSettingsError("SERVICE_SETTINGS_INVALID", "This native service is not registered.");
    declaration.config = structuredClone(config);
  }
  return result;
}

export async function openServiceSettings(options: {
  provider: DurableProvider; refs: TransitionRefs; runtimeId: string;
  validate(configurations: ServiceConfigurations): Promise<void>;
}) {
  const { provider, refs, runtimeId } = options;
  await provider.initializeRuntime({ ...refs, runtimeId,
    initialState: { generation: 0, configurations: {}, activeConfigurations: {}, applied: [] }, initialSpec: { version: 2 } });
  let active: Promise<unknown> = Promise.resolve();
  let uncertainId: string | undefined;
  function check(state: unknown, spec: { version: number }): asserts state is ServiceSettings {
    validateJsonValue(serviceSettingsSchema, state, "Invalid durable service settings");
    if (spec.version !== 2) throw new ServiceSettingsError("SERVICE_SETTINGS_INCOMPATIBLE", "The saved service settings require an explicit upgrade.");
  }
  async function read() {
    const saved = await provider.readSnapshot<ServiceSettings, { version: number }>({ ...refs, runtimeId });
    check(saved.state, saved.spec);
    if (uncertainId && saved.state.applied.includes(uncertainId)) uncertainId = undefined;
    return structuredClone(saved.state);
  }
  function change(expectedGeneration: number, update?: { serviceId: string; config: Record<string, Json> }) {
    const operation = active.then(async () => {
      if (uncertainId) throw new ServiceSettingsError("SERVICE_SETTINGS_UNCERTAIN", "Inspect the previous settings change before making another change.");
      if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0 || expectedGeneration === Number.MAX_SAFE_INTEGER)
        throw new ServiceSettingsError("SERVICE_SETTINGS_INVALID", "Invalid settings generation.");
      if (update && !/^[A-Za-z][A-Za-z0-9-]{0,99}$/.test(update.serviceId))
        throw new ServiceSettingsError("SERVICE_SETTINGS_INVALID", "Invalid service identity.");
      const id = crypto.randomUUID();
      const lease = await provider.acquireTransition<ServiceSettings, { version: number }, unknown>({ ...refs, runtimeId });
      if (!lease) throw new ServiceSettingsError("SERVICE_SETTINGS_BUSY", "Service settings are being changed elsewhere. Reload before applying.");
      let outcomeUnknown = false;
      try {
        check(lease.state, lease.spec);
        if (lease.state.generation !== expectedGeneration)
          throw new ServiceSettingsError("SERVICE_SETTINGS_CHANGED", "Service settings changed. Reload before applying.");
        const configurations = update ? { ...lease.state.configurations, [update.serviceId]: update.config } : lease.state.configurations;
        const state: ServiceSettings = { generation: expectedGeneration + 1, configurations,
          activeConfigurations: update ? lease.state.activeConfigurations : configurations,
          applied: [...lease.state.applied.slice(-99), id] };
        check(state, lease.spec);
        await options.validate(structuredClone(configurations));
        const entry = await provider.appendJournal({ ...refs, entry: { id, action: update ? "save" : "apply", ...update, expectedGeneration } });
        outcomeUnknown = true;
        const result = await provider.commitTransition({ ...refs, runtimeId, leaseToken: lease.leaseToken,
          expectedRevision: lease.revision, previousCursor: lease.cursor, nextCursor: entry.id,
          state, spec: lease.spec, specUpdates: [], effects: [] }).catch(error => {
            uncertainId = id;
            throw new ServiceSettingsError("SERVICE_SETTINGS_UNCERTAIN", "Settings completion is uncertain. Reload to inspect; do not retry.", { cause: error });
          });
        if (!result.ok) {
          outcomeUnknown = false;
          throw new ServiceSettingsError("SERVICE_SETTINGS_CHANGED", "Service settings changed while applying. Reload to inspect.");
        }
        return structuredClone(state);
      } finally {
        if (!outcomeUnknown) await provider.abortTransition({ ...refs, runtimeId, leaseToken: lease.leaseToken });
      }
    });
    active = operation.then(() => undefined, () => undefined);
    return operation;
  }
  return {
    read,
    save: (serviceId: string, config: Record<string, Json>, expectedGeneration: number) =>
      change(expectedGeneration, { serviceId, config: structuredClone(config) }),
    apply: (expectedGeneration: number) => change(expectedGeneration),
  };
}
