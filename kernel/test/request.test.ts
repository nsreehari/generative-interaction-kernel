import assert from "node:assert/strict";
import { test } from "vitest";

import {
  InMemoryStateModel,
  Kernel,
  assign,
  assignFrom,
  node,
  request,
  type Orchestrator,
  type ProjectedVocabularyManifest,
} from "../src/index";

const manifest = {
  gik: "0.1",
  type: "vocabulary",
  payload: {
    version: "request-demo/1.0",
    expression: "jsonata",
    namespaces: ["card_data"],
    capabilities: { button: { emits: ["tap"] } },
  } as ProjectedVocabularyManifest,
};

const responseSchema = {
  type: "object",
  required: ["approved"],
  additionalProperties: false,
  properties: { approved: { type: "boolean" } },
};

const document = {
  gik: "0.1",
  type: "program",
  payload: {
    root: node("button", "btn", {
      on: {
        tap: [request(
          { kind: "decision", policy: "order-approval", responseSchema },
          { prompt: "Approve order?" },
        )],
        resolved: [assign("card_data.status", "approved")],
        rejected: [assign("card_data.status", "rejected")],
      },
    }),
  },
};

function kernelWithOutcome(outcome: "resolved" | "rejected") {
  const orchestrator: Orchestrator = {
    async request(effect) {
      return {
        settlement: {
          effectId: effect.effectId!,
          outcome,
          data: { approved: outcome === "resolved" },
        },
      };
    },
  };
  return new Kernel(manifest, document, {
    state: new InMemoryStateModel(["card_data"]),
    orchestrator,
  });
}

test("request settlements carry immutable triggering context without host synthesis", async () => {
  const contextualResponseSchema = {
    type: "object",
    required: ["approved", "revision"],
    additionalProperties: false,
    properties: {
      approved: { type: "boolean" },
      revision: { type: "integer" },
    },
  };
  const contextualDocument = {
    gik: "0.1",
    type: "program",
    payload: {
      root: node("button", "btn", {
        on: {
          tap: [request(
            { kind: "decision", responseSchema: contextualResponseSchema },
            { requestType: "order-approval", prompt: "Approve order?", approved: false },
            { from: "{'revision':$event.revision,'correlationId':$event.correlationId}" },
          )],
          resolved: [
            assignFrom("card_data.request", "$event.requestContext"),
            assignFrom("card_data.approved", "$event.approved"),
            assignFrom("card_data.responseRevision", "$event.revision"),
          ],
        },
      }),
    },
  };
  const orchestrator: Orchestrator = {
    async request(effect) {
      assert.deepEqual(effect.data, {
        revision: 7,
        correlationId: "order-42",
        requestType: "order-approval",
        prompt: "Approve order?",
        approved: false,
      });
      return {
        settlement: {
          effectId: effect.effectId!,
          outcome: "resolved",
          data: { approved: true, revision: 99 },
        },
      };
    },
  };
  const kernel = new Kernel(manifest, contextualDocument, {
    state: new InMemoryStateModel(["card_data"]),
    orchestrator,
  });
  kernel.init();
  await kernel.dispatch({
    node: "btn",
    name: "tap",
    payload: { revision: 7, correlationId: "order-42", transient: "must-not-leak" },
  });
  assert.deepEqual((kernel.state() as any).card_data.request, {
    revision: 7,
    correlationId: "order-42",
    requestType: "order-approval",
    prompt: "Approve order?",
    approved: false,
    effectId: (kernel.state() as any).card_data.request.effectId,
  });
  assert.equal(typeof (kernel.state() as any).card_data.request.effectId, "string");
  assert.equal((kernel.state() as any).card_data.approved, true);
  assert.equal((kernel.state() as any).card_data.responseRevision, 99);
});

test("a resolved request re-enters as an addressed event within one dispatch", async () => {
  const kernel = kernelWithOutcome("resolved");
  kernel.init();
  const patch = await kernel.dispatch({ node: "btn", name: "tap" });
  assert.equal(patch.rev, 1);
  assert.deepEqual(patch.ops, [{ op: "set", path: "card_data.status", value: "approved" }]);
});

test("a rejected request re-enters through the rejected event", async () => {
  const kernel = kernelWithOutcome("rejected");
  kernel.init();
  const patch = await kernel.dispatch({ node: "btn", name: "tap" });
  assert.deepEqual(patch.ops, [{ op: "set", path: "card_data.status", value: "rejected" }]);
});

test("request settlement data is validated before its event is admitted", async () => {
  const orchestrator: Orchestrator = {
    async request(effect) {
      return {
        settlement: {
          effectId: effect.effectId!,
          outcome: "resolved",
          data: { approved: "yes" },
        },
      };
    },
  };
  const kernel = new Kernel(manifest, document, { orchestrator });
  kernel.init();
  await assert.rejects(
    () => kernel.dispatch({ node: "btn", name: "tap" }),
    /Invalid settlement for effect/,
  );
});