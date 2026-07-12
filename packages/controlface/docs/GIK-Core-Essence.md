# The Generative Interaction Kernel (GIK) — Core Essence

This is the architectural and philosophical seed from which the entire platform—and every projection built on it (UI, API, workflow, batch job)—grows. The Kernel governs state and interaction. It is blind to the medium the state eventually drives.

### 1. The Kernel is Medium-Blind
The Kernel evaluates `(state, event) → state`. It has no concept of screens, HTTP, queues, or files. Whatever consumes the resulting state — a UI renderer, an API gateway, a workflow executor, a headless worker — is a downstream projector attached at the edge.
**The GIK Principle:** One computational model runs the same closed grammar everywhere. A projector materializes Kernel state into its medium (React paints a component, an API server issues a request, a workflow engine advances a step) and feeds events back in. Swapping the projector changes the medium; the logic, grammar, and guarantees stay identical.

### 1.1 The Runtime Edge Has Layers
The Kernel is not the whole runtime stack. A useful distinction is:
*   **Kernel / Engine:** The embeddable execution core. It owns deterministic runtime semantics — resolve, reduce, patch, checkpoint, compensate.
*   **Face:** A callable capability surface around the Kernel and related pure helpers. A face can contain both pure functions (`validateDocument`) and live runtime operations (`getState`, `emit`, `checkpoint`, `restore`, `compensate`).
*   **Face Projection:** A filtered view of a face. `controlface` is the full catalog; `agentface` is an allowlisted subset of that same catalog.
*   **Transport:** The wire carrier for a chosen face projection. It moves requests, replies, patches, and events; it does not decide capability policy.

In the authoring stack above the Kernel, a useful profile model is: **N layers plus N-1 lowering recipes**. Those recipes are declarative artifacts that compile into the Kernel's existing runtime-document language (`props`, `read`, `readExpr`, `on`, `children`) rather than inventing a second binding language.

This layering matters because it answers three common questions precisely:
*   **Is the Kernel embeddable?** Yes. A live face embeds a Kernel instance and wraps it in tools.
*   **Is `agentface` a second engine?** No. It is a filtered projection of the same face.
*   **Does transport define capability?** No. The host chooses a projection first; transport only carries it.

### 2. The Two Planes of Human-Agent Symbiosis
The GIK governs two distinct pairings of Humans and AI, cleanly separating those who *build* a system from those who *operate within* it:
*   **The Authoring Plane (DX & ACX — Developer & AI Coder Experience):** Human Developers and AI Coding Agents work together to define the `Manifests` (the closed vocabulary of capabilities) and author the `Documents` (the graphs that wire them). Logic and grammar are formulated here.
*   **The Runtime Plane (HX & AX — Human & AI Agent Experience):** Human operators and AI Agents co-exist inside the running system, acting on shared state simultaneously. A human operator may be an end user of an app, an analyst on a console, or an engineer at a control surface; the AI Agent is any autonomous actor working alongside them.

### 3. The Closed Action Grammar Binds the Runtime Plane
Every runtime actor needs authority to act, and open protocols grant it by letting the actor emit arbitrary code or invent capabilities on the fly, which erases the security boundary.
**The GIK Principle:** By runtime, the vocabulary is already locked. Every runtime actor — human or agent — expresses itself through the same closed action grammar (`assign`, `derive`, `emit`, `invoke`, `route`, `confirm`) fixed during authoring. An action outside the Kernel's hard-coded set is dropped. Because both paths enter the one pipeline, there is no parity drift between what a human can do and what an agent can do — the runtime actor is constrained by the physics the Authoring plane defined, regardless of whether those actions ultimately drive a database write, an API call, or a pixel.

### 4. State is the Single Source of Truth for Every Actor
Any actor that needs to understand the system reads the same authoritative state graph. There is no privileged human channel and no separate machine channel that can drift apart.
**The GIK Principle:** The Kernel holds all state in a pure, medium-neutral graph. A human's projected view and an AI Agent's programmatic view resolve from that one graph. The Agent reads the exact structure driving the human's projection, so the Agent Experience (AX) is precise and needs no scraping, inference, or reconstruction of what the human sees.

**Practical corollary:** a face can be split into a **pure part** (authoring/validation helpers over JSON) and a **live part** (inspect/drive/time-travel tools over a running Kernel). This is usually a better organization than splitting by audience first, because the agent/control distinction is a projection concern, while pure/live is an implementation concern.

### 5. The Dataflow Graph is the Interaction Graph
Traditional systems maintain a separate event/wiring layer that connects one node's output to another's input — a layer an actor must author correctly and an agent can wire wrong.
**The GIK Principle:** Interaction is emergent, not wired. Because every node reads and writes paths in one shared reactive state graph, connection happens by data reference: one node writes a path, another node already reading that path re-resolves automatically. There is no second event system to hand-author or hallucinate. The dataflow graph *is* the interaction graph — one graph, not two — whether the nodes are UI cards, API stages, or workflow steps.

### 6. Data-Agnostic by Construction
A system that holds domain data or credentials becomes a liability surface and couples the engine to one deployment's data shapes.
**The GIK Principle:** The Kernel binds *tokenized* references resolved through host-supplied providers; it never holds domain data or credentials of its own. Capabilities declare what shape of data they need, and the host hydrates it at the edge. The engine stays least-privilege and portable — the same document runs against a different data backend by swapping providers, with no change to the logic or grammar.

### 7. Generative Proposals Validate or Fall Back
A generative planner is probabilistic; its output cannot be trusted to touch live state directly, in any medium.
**The GIK Principle:** Every generative proposal is schema-validated against the closed contract before it reaches the Kernel's reducer. Valid proposals apply; invalid or late ones are discarded and a deterministic fallback governs instead. Generation earns no special trust — a plan that fails validation never executes, and the system always has a coherent deterministic answer to fall back to. The planner that produces these proposals is a swappable component sitting *beside* the engine, not the engine itself: a deterministic reference planner always runs as the baseline, and any AI planner is an optional upgrade layered on top of it. The AI only ever *proposes*; the Kernel *decides*. This is the difference between **AI in the loop** and **AI as the loop**: turn the AI off and the system still runs correctly on its deterministic baseline — it becomes less adaptive, but never less correct. Swapping or removing the planner changes how well the surface adapts to context, never whether its output is valid, deterministic, or auditable.

### 8. Determinism is the Correctness Proof
"The AI decided" is not an answer a regulated system can give; behavior has to be provable independent of what a planner proposed.
**The GIK Principle:** Because behavior is a pure `(document, event) → patch` function, correctness is pinned by a golden-fixture matrix — recorded cases of the exact patch the Kernel must produce for a given document and event. The engine is replayable and its adaptivity is auditable: a fixture is the executable definition of "the governed surface behaves correctly," and it is the artifact you hand a security or compliance reviewer.

### 9. Stable Semantics, Adaptive Projection
Adapting an experience to context usually means forking logic, which lets meaning drift as variants multiply.
**The GIK Principle:** The Kernel separates *what an interaction means* (its stable semantic parts and roles) from *how it is arranged for the moment* (adaptive priority, density, and layout). The meaning stays fixed while the projection reshapes for role, urgency, device, or operational context. Because the semantic set is enumerable, the mapping stays bounded and testable — the system adapts its presentation without ever changing its meaning.

For GenUI profiles, that adaptive projection is best understood as a declared lowering chain: the profile names its layers, and its recipes describe how one layer lowers into the next. The semantics stay stable because the recipes reshape arrangement and materialization, not the underlying interaction meaning.

### 10. The Dual-Loop SLA (Deterministic Loop vs. Semantic Loop)
Throughput and responsiveness must never depend on model latency, in any medium.
**The GIK Principle:** Direct actions run through the Kernel's local deterministic reducer and settle immediately, while generative planning runs on a separate semantic loop that proposes structural change asynchronously behind a deterministic contract; on timeout, the deterministic path wins. AI changes the system's *adaptivity*, never its *latency* or *safety*.
*   **Frontend:** A field edit, a toggle, or a sort resolves instantly on the deterministic loop, while the semantic loop re-plans the surrounding layout in the background.
*   **Middleware / API:** An inbound request routes, validates, and returns on the deterministic loop at wire speed, while the semantic loop asynchronously decides whether to re-shape a downstream pipeline or adjust a routing policy.
*   **Backend / Workflow:** A workflow step advances and its guards evaluate deterministically without blocking, while the semantic loop proposes an alternate branch or an enriched plan that only takes effect once it validates against the same closed contract.

### 11. Forensics are a Property of the Architecture
Telemetry written by hand is always partial, because it depends on a developer remembering to instrument each path.
**The GIK Principle:** Because the Kernel is a pure `(state, event) → state` evaluator, every reduction emits a discrete trace: the triggering event, the prior state, the guard that passed, and the resulting mutation. The Kernel produces a complete, un-spoofable log for every actor and every medium — a human action, an agent decision, an API call, or a workflow transition — without any actor opting in.

## Notes

**Substrate over protocol.** The Kernel is a governed runtime, not an open wire protocol. Instead of streaming arbitrary instructions over a bidirectional channel and trusting the far end, the engine exposes a closed internal message contract and evaluates everything through the pure reducer. The safety, determinism, and audit guarantees are properties of the substrate itself — they cannot be negotiated away by a chatty client.

**The message contract.** The substrate speaks five message types: `manifest` (publish the capability vocabulary and expression dialect, once), `document` (the resolved intent tree plus machines, source → kernel), `patch` (ordered state deltas with a `rev`, kernel → projector), `event` (a human or agent interaction with payload, projector → kernel), and `trace` (observability: resolve / fallback / action / transition, kernel → sink). Every projector, in every medium, attaches through these same five messages.

**Semantic telemetry as a compounding moat.** Because the Kernel owns both the declared intent and the resulting projection, the `trace` stream is structural signal, not just an audit log. It records which parts of an interaction actors reach for, in which contexts, and how the projection is used — a dataset that tunes the planner over time and compounds with usage. The mapping improves with every run while the code stays still, and it cannot be replicated without the usage data.

**The bundle is the unit of packaging and composition.** A bundle is the message contract at rest: a portable JSON body — `manifest` (the capability vocabulary), `document` (the tree of capability nodes plus machines), and seed `state` — plus a JSON dependency contract, `externals`, that names everything the bundle needs from its host: the effect-handler names the host must supply and the projection-view providers it imports. Because that contract is one object, "what does this bundle require?" is a single read, never an inference from the document tree. What satisfies the contract is the bundle's only non-JSON part — native edge code a host plugs in, in two seams. The *write* edge is a set of **effect handlers** (`effect_handlers`): named functions the host routes the effectful verbs to (chiefly `invoke`), assembled into the Orchestrator that performs real work after the pure reduction settles — a `fetch` on a frontend, a payment-gateway charge or a queue route on a backend. This seam is universal; every medium performs effects. The *read* edge is a set of **projection views** (`projection_views`): the per-capability projection map the Projector uses to materialize the resolved node tree — one view per capability on a rich frontend (a metric, a table), usually collapsed to a single generic projection on a uniform-output backend, where it is empty because the whole resolved tree serializes to one JSON body or log line. Both seams are additive deltas over a host-provided floor: the base Orchestrator and base Projector are host-level and reused across bundles, so a bundle carries only its own handlers and views. A bundle is the noun both planes exchange — the Authoring plane produces bundles, the Runtime plane mounts them — rather than a plane or a Kernel primitive of its own; and bundles compose, since one bundle can `embed` another, building an interaction surface from other interaction surfaces, one shared-state runtime each. The JSON body holds no domain data, credentials, or medium; swapping the two edge seams runs the same `document` behind a queue or on a screen. The generic host that mounts any bundle is proven on the frontend today, while a backend host runs the same JSON body by driving the kernel's dispatch loop directly with its own service Orchestrator and non-UI projector.

### Summary
The GIK is a **universal state orchestration engine**. It is the connective tissue that translates the probabilistic output of Generative AI into deterministic, auditable, mathematically pure execution — the same way whether the state ultimately drives a backend API, a workflow, or a pixel, and whether the AI is authoring the system or operating inside it.
