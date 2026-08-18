import type {
  Action,
  DocNode,
  ExecutableProgramDefinition,
  Json,
  ProgramGraph,
  ProgramNode,
  RuntimeHandler,
} from "../../kernel/src/index";
import { isSystemInputToken, systemInputRuntimeExpression } from "@gik/evaluators";
import {
  BLUEPRINT_CAPABILITY,
  PRESENTATION_FRAGMENT_CAPABILITY,
} from "./hosted-blueprint";
import type { ExecutableCellTopology } from "./cells";
import type { CellDefinition, CellViewDecoration } from "./types";

export interface CellPlacement {
  cell: string;
  parent?: string;
  slot?: string;
  order?: number;
}

export interface CellProjectionDefinition {
  cells: Readonly<Record<string, CellDefinition>>;
  projections?: {
    presentation?: {
    roots: readonly string[];
    placements?: readonly CellPlacement[];
    };
  };
}

export const HOSTED_BLUEPRINT_OUTPUT_EVENT = "gik-hosted-blueprint-output";

/** Compile a Blueprint's optional presentation into the executable Kernel program. */
export function composeCellProgram(
  definition: CellProjectionDefinition,
  topology: ExecutableCellTopology,
): ExecutableProgramDefinition {
  if (topology.diagnostics.length > 0) {
    throw new Error(`Invalid cell topology '${topology.id}': ${topology.diagnostics.map(({ detail }) => detail).join("; ")}`);
  }
  const presentation = definition.projections?.presentation;
  const graph = composeCellGraph(topology);
  if (!presentation) {
    const hostedCell = topology.cells.find((cell) => cell.blueprint);
    if (hostedCell) {
      throw new Error(`Blueprint '${topology.id}' without a presentation projection cannot host child Blueprint Cell '${hostedCell.id}'`);
    }
    const handlers: RuntimeHandler[] = topology.cells.flatMap((cell) => {
      const events = cellEvents(cell);
      return Object.keys(events).length > 0 ? [{ id: cell.id, on: events }] : [];
    });
    return {
      ...(graph ? { graph } : {}),
      ...(handlers.length > 0 ? { handlers } : {}),
    };
  }
  const rootIds = presentation?.roots ?? [];
  if (rootIds.length === 0) {
    throw new Error(`Blueprint '${topology.id}' requires at least one presentation root`);
  }
  const byParent = new Map<string, CellPlacement[]>();
  for (const placement of presentation?.placements ?? []) {
    if (!placement.parent) continue;
    const siblings = byParent.get(placement.parent) ?? [];
    siblings.push(placement);
    byParent.set(placement.parent, siblings);
  }
  const presentedCellIds = new Set<string>();
  const compile = (cellId: string, ancestors: readonly string[]): DocNode => {
    if (ancestors.includes(cellId)) {
      throw new Error(`Blueprint '${topology.id}' has a presentation cycle at '${cellId}'`);
    }
    const cell = definition.cells[cellId];
    if (!cell) throw new Error(`Blueprint '${topology.id}' references unknown cell '${cellId}'`);
    if (!cell.blueprint && !cell.view?.capability) throw new Error(`Presentation cell '${cellId}' has no view capability`);
    presentedCellIds.add(cellId);
    const children = (byParent.get(cellId) ?? [])
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map(({ cell: childId }) => compile(childId, [...ancestors, cellId]));
    return toProgramNode(cell, children);
  };
  const roots = rootIds.map((rootId) => compile(rootId, []));
  const backgroundCells = topology.cells.filter((cell) => !presentedCellIds.has(cell.id));
  const handlers: RuntimeHandler[] = backgroundCells.flatMap((cell) => {
    const events = cellEvents(cell);
    return Object.keys(events).length > 0 ? [{ id: cell.id, on: events }] : [];
  });
  return {
    root: roots.length === 1
      ? roots[0]
      : {
          capability: PRESENTATION_FRAGMENT_CAPABILITY,
          id: "presentation-roots",
          edges: { children: roots },
        },
      ...(graph ? { graph } : {}),
    ...(handlers.length > 0 ? { handlers } : {}),
  };
}

  function composeCellGraph(topology: ExecutableCellTopology): ProgramGraph | undefined {
  const nodes: ProgramNode[] = topology.cells.flatMap((cell) => {
    const isStateBackedOutputCell = !cell.inputs?.length && !cell.compute?.length && !cell.sources?.length && !cell.blueprint;
    const outputStateInputs = isStateBackedOutputCell
      ? Object.fromEntries((cell.outputs ?? []).map(({ token, from }) => [`__output_${token}`, from ?? token]))
      : {};
    const declaredInputs = Object.fromEntries((cell.inputs ?? []).map((input) => [
        input.as ?? input.token,
        input.required === false
          ? { token: input.token, optional: true }
          : input.token,
      ]));
    const evaluatorInputs = {
      ...declaredInputs,
      ...outputStateInputs,
      ...(cell.sources?.length
        ? {
            __sources: {
              token: `blueprintRunState.cells.${cell.id}.sourceValues`,
              optional: true,
            },
          }
        : {}),
    };
    const evaluatorNode: ProgramNode | undefined = cell.compute?.length || cell.sources?.length || (!cell.blueprint && cell.outputs?.length)
      ? {
          id: `${cell.id}-evaluate`,
          inputs: evaluatorInputs,
          outputs: Object.fromEntries((cell.outputs ?? []).map(({ token }) => [token, token])),
          operation: {
            kind: "extension",
            name: "evaluate-cell",
            config: {
              ...structuredClone(cell),
              ...(isStateBackedOutputCell && cell.outputs?.length
                ? {
                    outputs: cell.outputs.map((output) => ({
                      ...output,
                      from: `inputs.__output_${output.token}`,
                    })),
                  }
                : {}),
            } as unknown as Json,
          },
        }
      : undefined;
    const hostedOutputNode: ProgramNode | undefined = cell.blueprint && cell.outputs?.length
      ? {
          id: `${cell.id}-hosted-output`,
          trigger: { event: HOSTED_BLUEPRINT_OUTPUT_EVENT, node: cell.id },
          outputs: Object.fromEntries(cell.outputs.map(({ token, from }) => [from, token])),
          operation: {
            kind: "compute",
            expression: cell.outputs.length === 1
              ? `$lookup(event, ${JSON.stringify(cell.outputs[0].from)})`
              : "event",
          },
        }
      : undefined;
    return [
      ...(evaluatorNode ? [evaluatorNode] : []),
      ...(hostedOutputNode ? [hostedOutputNode] : []),
    ];
  });
  if (nodes.length === 0) return undefined;
  const signalTokens = topology.cells
    .filter((cell) => cell.blueprint)
    .flatMap(providedTokens);
  return {
    inputs: [...new Set([
      ...topology.externalInputs,
      ...topology.cells.flatMap((cell) =>
        !cell.compute?.length && !cell.sources?.length && !cell.blueprint
          ? (cell.outputs ?? []).map(({ token, from }) => from ?? token)
          : []),
      ...topology.cells.filter((cell) => cell.sources?.length).map(({ id }) =>
        `blueprintRunState.cells.${id}.sourceValues`),
    ])],
    outputs: [...new Set(topology.cells.flatMap(providedTokens))],
    ...(signalTokens.length > 0 ? {
      ports: Object.fromEntries(signalTokens.map((token) => [token, { mode: "signal" as const }])),
    } : {}),
    nodes,
  };
}

function providedTokens(cell: CellDefinition): string[] {
  return (cell.outputs ?? []).map(({ token }) => token);
}

function toProgramNode(cell: CellDefinition, children: readonly DocNode[]): DocNode {
  const source = cell.sources?.[0];
  const blueprintReference = cell.blueprint && "$ref" in cell.blueprint ? cell.blueprint.$ref : undefined;
  const blueprintBinding = blueprintReference && typeof blueprintReference !== "string" ? blueprintReference : undefined;
  const directBindings = Object.entries(cell.view?.bindings ?? {})
    .filter(([, binding]) => binding.from !== undefined)
    .map(([prop, binding]) => [prop, binding.from!] as const);
  const expressionBindings = Object.entries(cell.view?.bindings ?? {})
    .filter(([, binding]) => binding.expression !== undefined)
    .map(([prop, binding]) => [prop, scopeCellExpression(binding.expression!, cell)] as const);
  const viewProps = source
    ? {
        ...structuredClone(cell.view?.props ?? {}),
        externalSource: { refreshEvent: "refresh" },
      }
    : cell.view?.props
      ? structuredClone(cell.view.props)
      : undefined;
  const props = cell.blueprint && !blueprintBinding
    ? { ...viewProps, hostedBlueprint: JSON.parse(JSON.stringify(cell.blueprint)) as Json }
    : viewProps;
  const events = cellEvents(cell);
  const edges = {
    ...(directBindings.length > 0 ? { read: Object.fromEntries(directBindings) } : {}),
    ...(expressionBindings.length > 0 || blueprintBinding ? {
      readExpr: {
        ...Object.fromEntries(expressionBindings),
        ...(blueprintBinding ? {
          hostedBlueprint: `{'$ref':${blueprintBinding.from ?? `(${scopeCellExpression(blueprintBinding.expression!, cell)})`}}`,
        } : {}),
      },
    } : {}),
    ...(cell.view?.visibility ? { gate: scopeCellExpression(cell.view.visibility, cell) } : {}),
    ...(Object.keys(events).length > 0 ? { on: events } : {}),
    ...(children.length > 0 ? { children: [...children] } : {}),
  };
  const cellNode: DocNode = {
    capability: cell.blueprint ? BLUEPRINT_CAPABILITY : cell.view!.capability!,
    id: cell.id,
    ...(props ? { props } : {}),
    ...(Object.keys(edges).length > 0 ? { edges } : {}),
  };
  const before = (cell.view?.before ?? []).map((view, index) =>
    toDecorationNode(view, `${cell.id}--before-${index}`, cell));
  const after = (cell.view?.after ?? []).map((view, index) =>
    toDecorationNode(view, `${cell.id}--after-${index}`, cell));
  if (before.length === 0 && after.length === 0) return cellNode;
  return {
    capability: PRESENTATION_FRAGMENT_CAPABILITY,
    id: `${cell.id}--decorated`,
    edges: { children: [...before, cellNode, ...after] },
  };
}

function toDecorationNode(view: CellViewDecoration, id: string, cell: CellDefinition): DocNode {
  const directBindings = Object.entries(view.bindings ?? {})
    .filter(([, binding]) => binding.from !== undefined)
    .map(([prop, binding]) => [prop, binding.from!] as const);
  const expressionBindings = Object.entries(view.bindings ?? {})
    .filter(([, binding]) => binding.expression !== undefined)
    .map(([prop, binding]) => [prop, scopeCellExpression(binding.expression!, cell)] as const);
  const edges = {
    ...(directBindings.length > 0 ? { read: Object.fromEntries(directBindings) } : {}),
    ...(expressionBindings.length > 0 ? { readExpr: Object.fromEntries(expressionBindings) } : {}),
    ...(view.visibility ? { gate: scopeCellExpression(view.visibility, cell) } : {}),
  };
  return {
    capability: view.capability,
    id,
    ...(view.props ? { props: structuredClone(view.props) } : {}),
    ...(Object.keys(edges).length > 0 ? { edges } : {}),
  };
}

function cellEvents(cell: CellDefinition): Record<string, Action[]> {
  const handlers = cell.behavior?.on ?? {};
  const undeclared = Object.keys(handlers).filter((event) => !cell.events?.[event]);
  if (undeclared.length > 0) {
    throw new Error(`Cell '${cell.id}' handles undeclared event(s): ${undeclared.join(", ")}`);
  }
  return Object.fromEntries(Object.entries(structuredClone(handlers)).map(
    ([event, actions]) => [event, actions.map((action) => scopeCellAction(cell, action))],
  ));
}

function scopeCellAction(cell: CellDefinition, action: Action): Action {
  const args = action.do === "assign" && typeof action.args.from === "string"
    ? { from: scopeCellExpression(action.args.from, cell) }
    : action.do === "assign"
      ? structuredClone(action.args)
      : undefined;
  const scoped = {
    ...action,
    ...(args ? { args } : {}),
    ...(action.guard ? { guard: scopeCellExpression(action.guard, cell) } : {}),
  };
  if (scoped.do !== "invoke" || scoped.control.sourceId) return scoped;
  const matches = (cell.sources ?? []).filter(({ operation }) => operation === scoped.control.tool);
  return matches.length === 1
    ? {
        ...scoped,
        control: {
          ...scoped.control,
          sourceId: matches[0].id,
          sourceCellId: cell.id,
          ...(matches[0].output ? { sourceOutputTransform: matches[0].output } : {}),
        },
      }
    : scoped;
}

function scopeCellExpression(expression: string, cell: CellDefinition): string {
  return expression.replace(/\bsystemInputs\.([A-Za-z_][A-Za-z0-9_]*)\b/g, (reference, token: string) => {
    if (!isSystemInputToken(token) || !cell.systemInputs?.includes(token)) return reference;
    return `(${systemInputRuntimeExpression(token, cell.id)})`;
  });
}
