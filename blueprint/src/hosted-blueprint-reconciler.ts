import type { Json, ResolvedNode } from "@gik/kernel";
import {
  BLUEPRINT_CAPABILITY,
  readBlueprintNodeDeclaration,
  resolveHostedBlueprint,
} from "./hosted-blueprint";
import type {
  BlueprintHostRegistry,
  CellBlueprint,
  HostedBlueprintDefinition,
} from "./types";

export interface HostedBlueprintMount<TNative = unknown> {
  node: ResolvedNode;
  path: string;
  instanceId: string;
  declaration: CellBlueprint;
  inputs: Record<string, Json>;
  definition: HostedBlueprintDefinition<TNative>;
}

export interface HostedBlueprintLifecycle<TInstance, TNative = unknown> {
  mount(hosted: HostedBlueprintMount<TNative>): Promise<TInstance> | TInstance;
  update?(instance: TInstance, hosted: HostedBlueprintMount<TNative>): Promise<TInstance | void> | TInstance | void;
  unmount(instance: TInstance): Promise<void> | void;
}

interface MountedHostedBlueprint<TInstance> {
  instance: TInstance;
  signature: string;
}

export class HostedBlueprintReconciler<TInstance, TNative = unknown> {
  private readonly mounted = new Map<string, MountedHostedBlueprint<TInstance>>();
  private operation: Promise<void> = Promise.resolve();

  constructor(
    private readonly parentBlueprintId: string,
    private readonly parentInstanceId: string,
    private readonly registry: BlueprintHostRegistry<TNative> | undefined,
    private readonly lifecycle: HostedBlueprintLifecycle<TInstance, TNative>,
  ) {}

  reconcile(tree: ResolvedNode): Promise<void> {
    return this.enqueue(() => this.reconcileNow(tree));
  }

  stop(): Promise<void> {
    return this.enqueue(async () => {
      for (const mounted of this.mounted.values()) await this.lifecycle.unmount(mounted.instance);
      this.mounted.clear();
    });
  }

  instances(): ReadonlyMap<string, TInstance> {
    return new Map([...this.mounted].map(([path, mounted]) => [path, mounted.instance]));
  }

  private async reconcileNow(tree: ResolvedNode): Promise<void> {
    const discovered = collectHostedBlueprints(tree);
    for (const [path, mounted] of this.mounted) {
      if (discovered.has(path)) continue;
      await this.lifecycle.unmount(mounted.instance);
      this.mounted.delete(path);
    }

    for (const [path, discoveredNode] of discovered) {
      const signature = JSON.stringify(discoveredNode.node.props);
      const current = this.mounted.get(path);
      if (current?.signature === signature) continue;
      const hosted = await this.resolveMount(path, discoveredNode.node, discoveredNode.declaration);
      if (current && this.lifecycle.update) {
        const updated = await this.lifecycle.update(current.instance, hosted);
        this.mounted.set(path, { instance: updated ?? current.instance, signature });
        continue;
      }
      if (current) await this.lifecycle.unmount(current.instance);
      const instance = await this.lifecycle.mount(hosted);
      this.mounted.set(path, { instance, signature });
    }
  }

  private async resolveMount(
    path: string,
    node: ResolvedNode,
    declaration: CellBlueprint,
  ): Promise<HostedBlueprintMount<TNative>> {
    const instanceId = `${this.parentInstanceId}/cells/${path}`;
    const definition = await resolveHostedBlueprint(declaration, this.registry, {
      parentBlueprintId: this.parentBlueprintId,
      parentInstanceId: this.parentInstanceId,
      cellId: node.id,
    });
    const { blueprint: _blueprint, hostedBlueprint: _hostedBlueprint, ...inputs } = node.props;
    return { node, path, instanceId, declaration, inputs, definition };
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.operation.then(operation, operation);
    this.operation = next.catch(() => undefined);
    return next;
  }
}

function collectHostedBlueprints(tree: ResolvedNode): Map<string, {
  node: ResolvedNode;
  declaration: CellBlueprint;
}> {
  const hosted = new Map<string, { node: ResolvedNode; declaration: CellBlueprint }>();
  const visit = (node: ResolvedNode, parentPath: string): void => {
    const path = parentPath ? `${parentPath}/${node.id}` : node.id;
    if (node.visible !== false && node.capability === BLUEPRINT_CAPABILITY) {
      const declarationInput = node.props.blueprint ?? node.props.hostedBlueprint;
      const declaration = readBlueprintNodeDeclaration(node.props);
      if (!declaration) {
        if (declarationInput !== undefined && declarationInput !== null) {
          throw new Error(`Hosted Blueprint node '${path}' has an invalid declaration`);
        }
      } else {
        hosted.set(path, { node, declaration });
      }
    }
    for (const child of node.children ?? []) visit(child, path);
  };
  visit(tree, "");
  return hosted;
}