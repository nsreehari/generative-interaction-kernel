import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { InMemoryStateModel, JsonataExpressionProvider, type OrchestratorEffect, type NativeServiceDeclaration } from "../../kernel/src/index";
import { DefaultServiceHost } from "../src/services/service-host";
import { ServiceKindRegistry, type ServiceKindFactory } from "../src/services/service-kinds";
import { createIntervalTimerServiceKind } from "../src/services/timer-service";

const effect: OrchestratorEffect = {
  kind: "invoke", node: "review", control: { tool: "observe", serviceRef: "clock" }, data: { intervalMs: 100 },
};
function host(options: { authorize?: boolean; reject?: () => boolean; transform?: boolean; factory?: ServiceKindFactory } = {}) {
  const registry = new ServiceKindRegistry();
  registry.register(options.factory ?? createIntervalTimerServiceKind());
  const declaration: NativeServiceDeclaration = {
    kind: "interval-timer", version: "1",
    operations: { observe: {
      operation: "interval", contract: "clock/v1",
      sense: { kind: "timer", signals: { due: { payloadSchema: { type: "object" } } } },
      request: {
        ...(options.transform ? { transform: { kind: "jsonata" as const, expr: "{'intervalMs':input.delay}" } } : {}),
        validators: [{ kind: "ajv-schema", schema: { type: "object", required: ["intervalMs"] } }],
      },
      settlement: { transform: { kind: "jsonata", expr: "{}" } },
    } },
  };
  return new DefaultServiceHost({
    blueprintId: "example", blueprintRevision: "1", declarations: { clock: declaration },
    registry, state: new InMemoryStateModel(), expression: new JsonataExpressionProvider({ safe: true }),
    ...(options.authorize || options.reject ? { authorizeInvocation: async () => options.reject?.()
      ? { outcome: "rejected" as const, reason: "revoked" }
      : { outcome: "authorized" as const } } : {}),
  });
}

test("timer provider delivers multiple discrete Signals, honors cancellation and preserves bounded invocation", async () => {
  vi.useFakeTimers();
  try {
    const service = host();
    const ids: string[] = [], errors: unknown[] = [];
    const handle = await service.observe(effect, {
      kind: "timer", async emit(signal) { ids.push(signal.id); }, onError(error) { errors.push(error); },
    });
    await vi.advanceTimersByTimeAsync(300);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    const request = (await service.listRequests())[0]!;
    await service.cancel(request.request.id);
    await vi.advanceTimersByTimeAsync(100);
    assert.equal(ids.length, 3);
    await handle.close();
    assert.equal((await service.getRequest(request.request.id))!.status, "cancelled");
    await vi.advanceTimersByTimeAsync(300);
    assert.equal(ids.length, 3);
    assert.deepEqual(errors, []);
    await assert.rejects(service.invoke(effect), /require observation/);
    await assert.rejects(service.enqueue(effect), /cannot be enqueued/);
  } finally { vi.useRealTimers(); }
});

test("observation reuses request validation and rejects unsupported contracts and inputs", async () => {
  const service = host();
  const options = { kind: "timer" as const, async emit() {}, onError() {} };
  await assert.rejects(service.observe({ ...effect, data: {} }, options), /request validation failed/);
  await assert.rejects(service.observe({ ...effect, data: { intervalMs: 0 } }, options), /intervalMs/);
  await assert.rejects(service.observe(effect, { ...options, kind: "feed" }), /kind does not match/);
  const unsupported = new ServiceKindRegistry();
  assert.equal((await unsupported.validate({ kind: "absent", version: "1", operations: {} })).ok, false);
});

test("authorization is rechecked before delivery and revocation stops a running timer", async () => {
  vi.useFakeTimers();
  try {
    let revoked = false, delivered = 0;
    const errors: unknown[] = [];
    const service = host({ reject: () => revoked });
    const handle = await service.observe(effect, {
      kind: "timer", async emit() { delivered++; }, onError(error) { errors.push(error); },
    });

    await vi.advanceTimersByTimeAsync(100);
    assert.equal(delivered, 1);
    revoked = true;
    await vi.advanceTimersByTimeAsync(300);
    assert.equal(delivered, 1);
    assert.ok(errors.length > 0);
    await handle.close();
    assert.equal((await service.listRequests())[0]!.status, "rejected");
  } finally { vi.useRealTimers(); }
});

test("observation establishment failures persist the failed outcome and error", async () => {
  const service = host();
  const errors: unknown[] = [];
  await assert.rejects(service.observe({ ...effect, data: { intervalMs: 0 } }, {
    kind: "timer", async emit() {}, onError(error) { errors.push(error); },
  }), /intervalMs/);
  const request = (await service.listRequests())[0]!;
  assert.equal(request.status, "failed");
  assert.match(request.error!, /intervalMs/);
  assert.equal(errors.length, 1);
});

test("provider-reported failures persist before notification and survive cleanup", async () => {
  const factory = createIntervalTimerServiceKind();
  let reportFailure!: (error: unknown) => void;
  const service = host({ factory: {
    ...factory,
    create: () => ({
      provider: { id: "interval-timer", version: "1" },
      async discover() { throw new Error("not used"); },
      execute() { throw new Error("not used"); },
      async observe(_request, context) {
        reportFailure = context.onError;
        return { close() {} };
      },
    }),
  } });
  let notify!: () => void;
  const notified = new Promise<void>((resolve) => { notify = resolve; });
  const errors: unknown[] = [];
  const handle = await service.observe(effect, {
    kind: "timer", async emit() {}, onError(error) { errors.push(error); notify(); },
  });
  reportFailure(new Error("provider disconnected"));
  await notified;
  assert.equal((await service.listRequests())[0]!.status, "failed");
  await handle.close();
  const failed = (await service.listRequests())[0]!;
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "provider disconnected");
  assert.equal(errors.length, 1);
});

test("observations carry the actual transformed request input outside provider-authored Signals", async () => {
  vi.useFakeTimers();
  try {
    const service = host({ transform: true });
    const requests: unknown[] = [];
    const errors: unknown[] = [];
    const handle = await service.observe({ ...effect, data: { delay: 100 } }, {
      kind: "timer", async emit(_signal, input) { requests.push(input); }, onError(error) { errors.push(error); },
    });
    await vi.advanceTimersByTimeAsync(100);
    await handle.close();
    assert.deepEqual(requests, [{ intervalMs: 100 }]);
    assert.deepEqual(errors, []);
  } finally { vi.useRealTimers(); }
});
