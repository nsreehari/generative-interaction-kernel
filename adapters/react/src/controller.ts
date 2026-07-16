// Framework-agnostic controller that runs the kernel's async loop:
// init -> resolve -> (on event) dispatch -> re-resolve -> notify.
// The React binding is a thin layer over this; the loop itself is testable headlessly.

import type { Kernel, Patch, ResolvedNode } from "@gik/kernel";

export type TreeListener = (tree: ResolvedNode) => void;

export class GenUIController {
  private tree: ResolvedNode | null = null;
  private lastPatch: Patch | null = null;
  private readonly listeners = new Set<TreeListener>();

  /**
   * @param kernel the kernel this controller drives.
   * @param settleStore optional barrier awaited before each re-resolve. A reactive store (e.g. a
   *   `computed`-backed shared composition) derives its cells asynchronously after an op lands; this
   *   hook lets the controller wait for that cascade to quiesce so the resolved tree is consistent.
   *   Plain (synchronous) stores omit it.
   */
  constructor(
    private readonly kernel: Kernel,
    private readonly settleStore?: () => Promise<void>
  ) {}

  /** Seed machine state and produce the first resolved tree. */
  async start(): Promise<ResolvedNode> {
    this.kernel.init();
    return this.refresh();
  }

  getTree(): ResolvedNode | null {
    return this.tree;
  }

  getLastPatch(): Patch | null {
    return this.lastPatch;
  }

  subscribe(listener: TreeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Dispatch a behavior event, then re-resolve and notify subscribers. */
  async emit(
    node: string,
    name: string,
    payload?: Record<string, unknown>,
    actorId?: string
  ): Promise<ResolvedNode> {
    this.lastPatch = await this.kernel.dispatch({
      node,
      name,
      payload: payload as Record<string, never> | undefined,
      actorId,
    });
    return this.refresh();
  }

  /**
   * Re-resolve and notify subscribers WITHOUT dispatching. Use when state this runtime reads changed
   * out-of-band — e.g. another runtime wrote a shared context namespace (ADR-0034) this one binds to,
   * so its rendered tree must catch up even though it dispatched nothing itself.
   */
  async resync(): Promise<ResolvedNode> {
    return this.refresh();
  }

  private async refresh(): Promise<ResolvedNode> {
    if (this.settleStore) await this.settleStore();
    const tree = await this.kernel.resolve();
    this.tree = tree;
    for (const listener of this.listeners) listener(tree);
    return tree;
  }
}
