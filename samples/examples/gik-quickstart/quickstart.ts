// A minimal demo of the public backend and middleware package. It exposes the headless
// GIK packages under stable namespaces without loading React or browser components.
//
// Run:  npx tsx generative-interaction-kernel/samples/examples/gik-quickstart/quickstart.ts

import { kernel, agentface } from "@gik/headless";

// 1. Kernel authoring builders are reachable through the `kernel` namespace.
//    These return closed-grammar Action shapes — no running runtime required.
const actions = [
  kernel.assign("cart.count", 1),
  kernel.emit("checkout"),
  kernel.invoke("charge", { amount: 4200 }),
];
console.log("authored actions:\n" + JSON.stringify(actions, null, 2));

// 2. The agent-facing projection factory is reachable through the `agentface`
//    namespace. The stateless dispatcher exposes authoring/validation tools only.
const dispatch = agentface.createStatelessAgentFaceDispatcher();
console.log("\nstateless agentface dispatcher ready:", dispatch != null);

console.log(
  "\n@gik/headless is the public GIK entrypoint for backend services, middleware, and workers.",
);
