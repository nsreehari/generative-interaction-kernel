// A minimal headless demo of the `gik` meta-package — the batteries-included entry
// point that re-exports the core @gik/* packages under stable namespaces. Its whole
// job is convenience wiring, so this sample simply proves that the common surface is
// reachable from a single `import ... from "gik"`.
//
// Run:  npx tsx generative-interaction-kernel/samples/gik-meta/quickstart.ts

import { kernel, agentface } from "gik";

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
  "\ngik re-exports the core surface — for the leanest dependency graph in real\n" +
    "projects, depend on @gik/kernel, @gik/react, @gik/agentface, etc. directly.",
);
