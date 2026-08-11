// A minimal demo of composing public GIK packages without loading React or browser components.
//
// Run:  npx tsx generative-interaction-kernel/samples/examples/gik-quickstart/quickstart.ts

import { createStatelessAgentFaceDispatcher } from "@gik/agentface";
import { assign, emit, invoke } from "@gik/kernel";

// 1. Kernel authoring builders return closed-grammar Action shapes; no runtime is required.
const actions = [
  assign("cart.count", 1),
  emit("checkout"),
  invoke("charge", { amount: 4200 }),
];
console.log("authored actions:\n" + JSON.stringify(actions, null, 2));

// 2. The stateless AgentFace dispatcher exposes authoring and validation tools only.
const dispatch = createStatelessAgentFaceDispatcher();
console.log("\nstateless agentface dispatcher ready:", dispatch != null);

console.log("\nPublic GIK capabilities compose directly from their owning packages.");
