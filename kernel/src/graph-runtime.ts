import type { ExpressionProvider } from "./providers";
import type {
  ExecutionBudget,
  GraphDiagnostic,
  GraphExecutionResult,
  GraphInspection,
  GraphMutation,
  GraphNodeExecutionOutcome,
  GraphNodeRuntimeState,
  GIKEvent,
  InputPort,
  Json,
  OutputPort,
  PortMode,
  PortToken,
  ProgramGraph,
  ProgramNode,
  TokenRuntimeState,
} from "./types";

export type GraphNodeExecutor = (
  node: ProgramNode,
  inputs: Record<string, Json>,
  event?: GIKEvent,
) => Promise<GraphNodeExecutionOutcome>;

const DEFAULT_MAX_NODE_EXECUTIONS = 10_000;
const DEFAULT_MAX_PUBLICATIONS = 10_000;

function inputPort(port: PortToken | InputPort): InputPort {
  return typeof port === "string" ? { token: port } : port;
}

function outputPort(port: PortToken | OutputPort): OutputPort {
  return typeof port === "string" ? { token: port } : port;
}

function jsonEqual(left: Json | undefined, right: Json): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

function requireObject(value: Json, nodeId: string): Record<string, Json> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Graph node '${nodeId}' must return an object when it declares multiple outputs`);
  }
  return value;
}

export class ContinuousGraphRuntime {
  private graph: ProgramGraph;
  private topologyVersion = 0;
  private readonly tokens = new Map<PortToken, TokenRuntimeState>();
  private readonly nodes = new Map<string, GraphNodeRuntimeState>();
  private consumers = new Map<PortToken, string[]>();
  private readonly triggered = new Set<string>();
  private readonly eventByNode = new Map<string, GIKEvent>();
  private lastStatus: GraphExecutionResult["status"] = "quiescent";

  constructor(
    graph: ProgramGraph,
    private readonly expression: ExpressionProvider,
    private readonly executeNode?: GraphNodeExecutor,
  ) {
    this.graph = structuredClone(graph);
    this.reindex();
  }

  snapshotTokens(): Record<PortToken, TokenRuntimeState> {
    return Object.fromEntries([...this.tokens].map(([token, state]) => [token, structuredClone(state)]));
  }

  snapshotNodes(): Record<string, GraphNodeRuntimeState> {
    return Object.fromEntries([...this.nodes].map(([id, state]) => [id, structuredClone(state)]));
  }

  status(): GraphExecutionResult["status"] {
    return this.lastStatus;
  }

  readyNodeIds(): string[] {
    return this.readyNodes().map(({ id }) => id);
  }

  inspect(): GraphInspection {
    const diagnostics: GraphDiagnostic[] = [];
    const producers = new Map<PortToken, string[]>();
    for (const node of this.graph.nodes) {
      for (const port of Object.values(node.outputs ?? {})) {
        const token = outputPort(port).token;
        const list = producers.get(token) ?? [];
        list.push(node.id);
        producers.set(token, list);
      }
    }
    const external = new Set(this.graph.inputs ?? []);
    for (const token of this.tokens.keys()) {
      if (!external.has(token) && !producers.has(token)) diagnostics.push({ kind: "unproduced-token", token });
      if (!this.consumers.has(token) && !(this.graph.outputs ?? []).includes(token)) {
        diagnostics.push({ kind: "unused-token", token });
      }
    }
    for (const nodes of feedbackComponents(this.graph)) diagnostics.push({ kind: "feedback-component", nodes });
    return { topologyVersion: this.topologyVersion, diagnostics };
  }

  async publish(
    values: Record<PortToken, Json>,
    budget: ExecutionBudget = {},
  ): Promise<GraphExecutionResult> {
    const publications: Record<PortToken, Json> = {};
    let publicationCount = 0;
    for (const [token, value] of Object.entries(values)) {
      if (this.publishToken(token, value, undefined, this.portMode(token))) {
        publications[token] = value;
        publicationCount += 1;
      }
    }

    return this.run(publications, publicationCount, budget);
  }

  async start(budget: ExecutionBudget = {}): Promise<GraphExecutionResult> {
    for (const node of this.graph.nodes) {
      if (node.trigger && "startup" in node.trigger) this.triggered.add(node.id);
    }
    return this.run({}, 0, budget);
  }

  async dispatch(event: GIKEvent, budget: ExecutionBudget = {}): Promise<GraphExecutionResult> {
    for (const node of this.graph.nodes) {
      const trigger = node.trigger;
      if (!trigger || !("event" in trigger) || trigger.event !== event.name) continue;
      if (trigger.node !== undefined && trigger.node !== event.node) continue;
      this.triggered.add(node.id);
      this.eventByNode.set(node.id, event);
    }
    return this.run({}, 0, budget);
  }

  async resume(budget: ExecutionBudget = {}): Promise<GraphExecutionResult> {
    return this.run({}, 0, budget);
  }

  async complete(
    nodeId: string,
    outputs: Record<string, Json>,
    budget: ExecutionBudget = {},
  ): Promise<GraphExecutionResult> {
    const node = this.graph.nodes.find(({ id }) => id === nodeId);
    if (!node) throw new Error(`Unknown graph node '${nodeId}'`);
    const state = this.nodes.get(nodeId)!;
    if (state.status !== "suspended") throw new Error(`Graph node '${nodeId}' is not suspended`);
    state.status = "idle";
    const publications: Record<PortToken, Json> = {};
    let publicationCount = 0;
    for (const [localName, value] of Object.entries(outputs)) {
      const declared = node.outputs?.[localName];
      if (!declared) throw new Error(`Graph node '${node.id}' published undeclared output '${localName}'`);
      const port = outputPort(declared);
      if (this.publishToken(port.token, value, node.id, port.mode ?? this.portMode(port.token))) {
        publications[port.token] = value;
        publicationCount += 1;
      }
    }
    return this.run(publications, publicationCount, budget);
  }

  private async run(
    publications: Record<PortToken, Json>,
    initialPublicationCount: number,
    budget: ExecutionBudget,
  ): Promise<GraphExecutionResult> {
    let publicationCount = initialPublicationCount;
    const operations = [] as GraphExecutionResult["operations"];
    const effects = [] as GraphExecutionResult["effects"];
    const events = [] as GraphExecutionResult["events"];

    const maxNodeExecutions = budget.maxNodeExecutions ?? DEFAULT_MAX_NODE_EXECUTIONS;
    const maxPublications = budget.maxPublications ?? DEFAULT_MAX_PUBLICATIONS;
    let nodeExecutions = 0;

    while (true) {
      const ready = this.readyNodes();
      if (ready.length === 0) {
        this.lastStatus = [...this.nodes.values()].some(({ status }) => status === "suspended")
          ? "suspended"
          : "quiescent";
        return { status: this.lastStatus, publications, operations, effects, events, readyNodes: [], nodeExecutions, publicationCount };
      }
      if (nodeExecutions >= maxNodeExecutions || publicationCount >= maxPublications) {
        this.lastStatus = "yielded";
        return {
          status: this.lastStatus,
          publications,
          operations,
          effects,
          events,
          readyNodes: ready.map((node) => node.id),
          nodeExecutions,
          publicationCount,
        };
      }

      const node = ready[0];
      const state = this.nodes.get(node.id)!;
      state.status = "running";
      const inputs = this.readInputs(node);
      this.captureConsumedVersions(node, state);
      const outcome = await this.evaluateNode(node, inputs, this.eventByNode.get(node.id));
      this.triggered.delete(node.id);
      this.eventByNode.delete(node.id);
      nodeExecutions += 1;
      operations.push(...(outcome.operations ?? []));
      effects.push(...(outcome.effects ?? []));
      events.push(...(outcome.events ?? []));
      for (const event of outcome.events ?? []) this.triggerEvent(event);
      for (const [localName, value] of Object.entries(outcome.outputs ?? {})) {
        const declared = node.outputs?.[localName];
        if (!declared) throw new Error(`Graph node '${node.id}' published undeclared output '${localName}'`);
        const port = outputPort(declared);
        const mode = port.mode ?? this.portMode(port.token);
        if (this.publishToken(port.token, value, node.id, mode)) {
          publications[port.token] = value;
          publicationCount += 1;
        }
      }
      state.status = outcome.suspended ? "suspended" : "idle";
    }
  }

  mutate(mutations: readonly GraphMutation[]): void {
    const next = structuredClone(this.graph);
    for (const mutation of mutations) {
      switch (mutation.op) {
        case "addNode":
          if (next.nodes.some(({ id }) => id === mutation.node.id)) throw new Error(`Duplicate graph node '${mutation.node.id}'`);
          next.nodes.push(mutation.node);
          break;
        case "removeNode":
          next.nodes = next.nodes.filter(({ id }) => id !== mutation.nodeId);
          break;
        case "replaceNode": {
          const index = next.nodes.findIndex(({ id }) => id === mutation.nodeId);
          if (index === -1) throw new Error(`Unknown graph node '${mutation.nodeId}'`);
          next.nodes[index] = mutation.node;
          break;
        }
        case "addPort":
          next.ports = { ...(next.ports ?? {}), [mutation.token]: mutation.definition ?? {} };
          break;
        case "removePort":
          if (next.ports) delete next.ports[mutation.token];
          break;
        case "updatePort":
          next.ports = { ...(next.ports ?? {}), [mutation.token]: mutation.definition };
          break;
      }
    }
    this.graph = next;
    this.topologyVersion += 1;
    this.reindex();
  }

  private reindex(): void {
    const ids = new Set<string>();
    this.consumers = new Map();
    for (const node of this.graph.nodes) {
      if (ids.has(node.id)) throw new Error(`Duplicate graph node '${node.id}'`);
      ids.add(node.id);
      if (!this.nodes.has(node.id)) this.nodes.set(node.id, { status: "idle", consumedVersions: {} });
      for (const port of Object.values(node.inputs ?? {})) {
        const token = inputPort(port).token;
        this.ensureToken(token);
        const list = this.consumers.get(token) ?? [];
        list.push(node.id);
        this.consumers.set(token, list);
      }
      for (const port of Object.values(node.outputs ?? {})) this.ensureToken(outputPort(port).token);
    }
    for (const token of [...(this.graph.inputs ?? []), ...(this.graph.outputs ?? []), ...Object.keys(this.graph.ports ?? {})]) {
      this.ensureToken(token);
    }
    for (const id of [...this.nodes.keys()]) if (!ids.has(id)) this.nodes.delete(id);
    for (const list of this.consumers.values()) list.sort((left, right) => left.localeCompare(right));
  }

  private ensureToken(token: PortToken): TokenRuntimeState {
    const current = this.tokens.get(token);
    if (current) return current;
    const created: TokenRuntimeState = { status: "absent", version: 0 };
    this.tokens.set(token, created);
    return created;
  }

  private portMode(token: PortToken): PortMode {
    return this.graph.ports?.[token]?.mode ?? "value";
  }

  private publishToken(token: PortToken, value: Json, producedBy: string | undefined, mode: PortMode): boolean {
    const state = this.ensureToken(token);
    if (mode === "value" && state.status === "available" && jsonEqual(state.value, value)) return false;
    state.status = "available";
    state.value = mode === "stream"
      ? [...(Array.isArray(state.value) ? state.value : []), value]
      : value;
    state.version += 1;
    state.producedBy = producedBy;
    return true;
  }

  private readyNodes(): ProgramNode[] {
    return this.graph.nodes
      .filter((node) => {
        const state = this.nodes.get(node.id)!;
        if (state.status === "running" || state.status === "suspended") return false;
        const ports = Object.values(node.inputs ?? {}).map(inputPort);
        if (ports.some(({ token, optional }) => !optional && this.ensureToken(token).status === "absent")) return false;
        if (this.triggered.has(node.id)) return true;
        return ports.some(({ token }) => {
          const current = this.ensureToken(token);
          return current.status === "available" && current.version > (state.consumedVersions[token] ?? 0);
        });
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private readInputs(node: ProgramNode): Record<string, Json> {
    const inputs: Record<string, Json> = {};
    for (const [name, declared] of Object.entries(node.inputs ?? {})) {
      const port = inputPort(declared);
      const state = this.ensureToken(port.token);
      if (state.status === "available") inputs[name] = state.value ?? null;
    }
    return inputs;
  }

  private captureConsumedVersions(node: ProgramNode, state: GraphNodeRuntimeState): void {
    for (const declared of Object.values(node.inputs ?? {})) {
      const token = inputPort(declared).token;
      state.consumedVersions[token] = this.ensureToken(token).version;
    }
  }

  private async evaluateNode(
    node: ProgramNode,
    inputs: Record<string, Json>,
    event?: GIKEvent,
  ): Promise<GraphNodeExecutionOutcome> {
    const bindings = { inputs, event: event?.payload ?? {} };
    if (node.when && !(await this.expression.eval(node.when, {}, bindings))) return {};
    switch (node.operation.kind) {
      case "compute": {
        const value = await this.expression.eval(node.operation.expression, {}, bindings);
        const names = Object.keys(node.outputs ?? {});
        if (names.length === 0) return {};
        if (names.length === 1) return { outputs: { [names[0]]: value } };
        return { outputs: requireObject(value, node.id) };
      }
      case "decision": {
        for (const branch of node.operation.cases) {
          if (!(await this.expression.eval(branch.when, {}, bindings))) continue;
          const outputs: Record<string, Json> = {};
          for (const [name, expression] of Object.entries(branch.outputs ?? {})) {
            outputs[name] = await this.expression.eval(expression, {}, bindings);
          }
          return { outputs };
        }
        return {};
      }
      case "actions":
      case "invoke": {
        if (!this.executeNode) throw new Error(`Graph node operation '${node.operation.kind}' requires Kernel execution context`);
        return this.executeNode(node, inputs, event);
      }
    }
  }

  private triggerEvent(event: GIKEvent): void {
    for (const node of this.graph.nodes) {
      const trigger = node.trigger;
      if (!trigger || !("event" in trigger) || trigger.event !== event.name) continue;
      if (trigger.node !== undefined && trigger.node !== event.node) continue;
      this.triggered.add(node.id);
      this.eventByNode.set(node.id, event);
    }
  }
}

function feedbackComponents(graph: ProgramGraph): string[][] {
  const producers = new Map<PortToken, string[]>();
  for (const node of graph.nodes) {
    for (const declared of Object.values(node.outputs ?? {})) {
      const token = outputPort(declared).token;
      producers.set(token, [...(producers.get(token) ?? []), node.id]);
    }
  }
  const edges = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    for (const declared of Object.values(node.inputs ?? {})) {
      for (const producer of producers.get(inputPort(declared).token) ?? []) {
        const outgoing = edges.get(producer) ?? new Set<string>();
        outgoing.add(node.id);
        edges.set(producer, outgoing);
      }
    }
  }
  const components: string[][] = [];
  for (const node of graph.nodes) {
    if ((edges.get(node.id) ?? new Set()).has(node.id)) components.push([node.id]);
  }
  for (let left = 0; left < graph.nodes.length; left += 1) {
    for (let right = left + 1; right < graph.nodes.length; right += 1) {
      const a = graph.nodes[left].id;
      const b = graph.nodes[right].id;
      if (reachable(edges, a, b) && reachable(edges, b, a)) {
        const existing = components.find((component) => component.includes(a) || component.includes(b));
        if (existing) {
          if (!existing.includes(a)) existing.push(a);
          if (!existing.includes(b)) existing.push(b);
          existing.sort();
        } else {
          components.push([a, b].sort());
        }
      }
    }
  }
  return components;
}

function reachable(edges: Map<string, Set<string>>, from: string, to: string): boolean {
  const queue = [from];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to && current !== from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(edges.get(current) ?? []));
  }
  return false;
}