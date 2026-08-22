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
import type {
  CellDefinition,
  CellPotentialView,
  CellViewDecoration,
  PresentationDefinition,
} from "./types";

export interface CellProjectionDefinition {
  cells: Readonly<Record<string, CellDefinition>>;
  presentation?: PresentationDefinition;
}

export const HOSTED_BLUEPRINT_OUTPUT_EVENT = "gik-hosted-blueprint-output";

/** Compile a Blueprint's optional presentation into the executable Kernel program. Presentation is a
 * closed set of named slots (self-declared nesting via each slot's own `region`) plus a root. A Cell
 * carries zero, one, or many named `potentialViews`; each one independently self-declares which
 * slot(s) it attaches to — never the reverse — and stays dormant unless that slot is reachable from
 * the active presentation's root. */
export function composeCellProgram(
  definition: CellProjectionDefinition,
  topology: ExecutableCellTopology,
): ExecutableProgramDefinition {
  if (topology.diagnostics.length > 0) {
    throw new Error(`Invalid cell topology '${topology.id}': ${topology.diagnostics.map(({ detail }) => detail).join("; ")}`);
  }
  const presentation = definition.presentation;
  const graph = composeCellGraph(topology);
  if (!presentation) {
    const hostedCell = topology.cells.find((cell) => cell.blueprint);
    if (hostedCell) {
      throw new Error(`Blueprint '${topology.id}' without a presentation cannot host child Blueprint Cell '${hostedCell.id}'`);
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

  // Every slot's own declared parent, and the fixed declaration order used to resolve attachment order.
  const slotParent = new Map<string, string | undefined>();
  const slotOrder: string[] = [];
  for (const entry of presentation.slots) {
    const id = typeof entry === "string" ? entry : entry.id;
    const region = typeof entry === "string" ? undefined : entry.region;
    if (slotParent.has(id)) throw new Error(`Blueprint '${topology.id}' declares slot '${id}' more than once`);
    slotParent.set(id, region);
    slotOrder.push(id);
  }
  if (!slotParent.has(presentation.root)) {
    throw new Error(`Blueprint '${topology.id}' presentation root '${presentation.root}' is not a declared slot`);
  }

  type Attachment =
    | { kind: "slot"; id: string }
    | { kind: "cell"; cell: CellDefinition; viewName: string; view: CellPotentialView };
  const attachments = new Map<string, Attachment[]>();
  const attach = (parent: string, attachment: Attachment) => {
    if (!attachments.has(parent)) attachments.set(parent, []);
    attachments.get(parent)!.push(attachment);
  };

  // Nested slots attach in slots-array declaration order, always ahead of any Cell attached to the
  // same parent — a fixed, deterministic rule since attachment is declared on each participant
  // independently rather than as one ordered parent-owned list.
  for (const id of slotOrder) {
    const parent = slotParent.get(id);
    if (parent === undefined) continue;
    if (!slotParent.has(parent)) {
      throw new Error(`Blueprint '${topology.id}' slot '${id}' declares unknown parent region '${parent}'`);
    }
    attach(parent, { kind: "slot", id });
  }

  // Cell attachments follow, in Cell declaration order, then declared potentialViews order; a
  // `region` array attaches one named view independently into each named slot (one rendered
  // instance per attachment). A Cell may carry many named views; each is dormant unless its own
  // region is reachable from the active presentation's root.
  const presentedCellIds = new Set<string>();
  for (const cell of topology.cells) {
    for (const [viewName, view] of Object.entries(cell.potentialViews ?? {})) {
      const region = view.region;
      if (region === undefined) continue;
      for (const targetSlot of Array.isArray(region) ? region : [region]) {
        if (!slotParent.has(targetSlot)) {
          throw new Error(`Blueprint '${topology.id}' Cell '${cell.id}' view '${viewName}' attaches to unknown region '${targetSlot}'`);
        }
        attach(targetSlot, { kind: "cell", cell, viewName, view });
        presentedCellIds.add(cell.id);
      }
    }
  }

  const compileSlot = (slotId: string, ancestors: readonly string[]): DocNode => {
    if (ancestors.includes(slotId)) {
      throw new Error(`Blueprint '${topology.id}' has a presentation cycle at slot '${slotId}'`);
    }
    const children = (attachments.get(slotId) ?? []).map((attachment) =>
      attachment.kind === "slot"
        ? compileSlot(attachment.id, [...ancestors, slotId])
        : compileCellInstance(attachment.cell, attachment.viewName, attachment.view, slotId));
    return {
      capability: PRESENTATION_FRAGMENT_CAPABILITY,
      id: slotId,
      ...(children.length > 0 ? { edges: { children } } : {}),
    };
  };
  const compileCellInstance = (
    cell: CellDefinition,
    viewName: string,
    view: CellPotentialView,
    slotId: string,
  ): DocNode => {
    if (!cell.blueprint && !view.capability) {
      throw new Error(`Presentation cell '${cell.id}' view '${viewName}' has no view capability`);
    }
    return toProgramNode(cell, view, `${cell.id}--${viewName}--in-${slotId}`);
  };

  const root = compileSlot(presentation.root, []);
  const backgroundCells = topology.cells.filter((cell) => !presentedCellIds.has(cell.id));
  const handlers: RuntimeHandler[] = backgroundCells.flatMap((cell) => {
    const events = cellEvents(cell);
    return Object.keys(events).length > 0 ? [{ id: cell.id, on: events }] : [];
  });
  return {
    root,
    ...(graph ? { graph } : {}),
    ...(handlers.length > 0 ? { handlers } : {}),
  };
}

/** Maps every id a dispatched event's `node` can carry (a background Cell's own id, or a presented
 * Cell's generated `<cellId>--<viewName>--in-<slotId>` instance id — the exact ids `composeCellProgram`
 * attaches `edges.on`/`RuntimeHandler`s to) back to the owning Cell id. Event-contract validation
 * (undeclared-event rejection, payload schema) must resolve through this map rather than looking a
 * dispatched `event.node` up directly against `cells`, since a presented Cell's dispatched node id is
 * never its own Cell id. Mirrors `composeCellProgram`'s own attachment rule so the two can never drift:
 * a Cell with no presentation, or with no `potentialViews` region reachable from it, owns its own
 * (background-handler) id; every other reachable `(viewName, slot)` attachment owns its generated id. */
export function deriveCellEventOwners(definition: CellProjectionDefinition): Record<string, string> {
  const owners: Record<string, string> = {};
  const cells = Object.values(definition.cells);
  if (!definition.presentation) {
    for (const cell of cells) owners[cell.id] = cell.id;
    return owners;
  }
  const presentedCellIds = new Set<string>();
  for (const cell of cells) {
    for (const [viewName, view] of Object.entries(cell.potentialViews ?? {})) {
      const region = view.region;
      if (region === undefined) continue;
      for (const targetSlot of Array.isArray(region) ? region : [region]) {
        owners[`${cell.id}--${viewName}--in-${targetSlot}`] = cell.id;
        presentedCellIds.add(cell.id);
      }
    }
  }
  for (const cell of cells) {
    if (!presentedCellIds.has(cell.id)) owners[cell.id] = cell.id;
  }
  return owners;
}

  function composeCellGraph(topology: ExecutableCellTopology): ProgramGraph | undefined {
  const nodes: ProgramNode[] = topology.cells.flatMap((cell) => {
    // A state-backed output reads a bare state path this Cell's own `compute` did NOT just produce in
    // this same evaluation -- e.g. a Cell whose own event handler assigns a state path and simply
    // republishes it (nothing about that path depends on this Cell's other declared inputs/compute/
    // sources). Such an output must be wired as its own implicit graph input keyed on that same path,
    // or the node never re-evaluates -- and so never republishes the token -- when an unrelated action
    // changes that path. This applies per-output, regardless of whether the Cell also has unrelated
    // inputs/compute/sources of its own. A `computed.<path>` prefix, or a bare path this Cell's own
    // `compute` assigns to, both reference a value this same evaluation already produces fresh --
    // neither needs (or should get) the implicit-input treatment.
    const computeAssignedPaths = new Set((cell.compute ?? []).map(({ assign }) => assign));
    const isStateBackedOutput = ({ from, token }: { from?: string; token: string }): boolean => {
      const path = from ?? token;
      return !path.startsWith("computed.") && !computeAssignedPaths.has(path);
    };
    const stateBackedOutputs = (cell.outputs ?? []).filter(isStateBackedOutput);
    const outputStateInputs = Object.fromEntries(
      stateBackedOutputs.map(({ token, from }) => [`__output_${token}`, from ?? token]),
    );
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
              ...(stateBackedOutputs.length > 0
                ? {
                    outputs: (cell.outputs ?? []).map((output) =>
                      isStateBackedOutput(output)
                        ? { ...output, from: `inputs.__output_${output.token}` }
                        : output),
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

function toProgramNode(cell: CellDefinition, view: CellPotentialView, nodeId: string): DocNode {
  const source = cell.sources?.[0];
  const blueprintReference = cell.blueprint && "$ref" in cell.blueprint ? cell.blueprint.$ref : undefined;
  const blueprintBinding = blueprintReference && typeof blueprintReference !== "string" ? blueprintReference : undefined;
  const directBindings = Object.entries(view.bindings ?? {})
    .filter(([, binding]) => binding.from !== undefined)
    .map(([prop, binding]) => [prop, binding.from!] as const);
  const expressionBindings = Object.entries(view.bindings ?? {})
    .filter(([, binding]) => binding.expression !== undefined)
    .map(([prop, binding]) => [prop, scopeCellExpression(binding.expression!, cell)] as const);
  const viewProps = source
    ? {
        ...structuredClone(view.props ?? {}),
        externalSource: { refreshEvent: "refresh" },
      }
    : view.props
      ? structuredClone(view.props)
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
    ...(view.visibility ? { gate: scopeCellExpression(view.visibility, cell) } : {}),
    ...(Object.keys(events).length > 0 ? { on: events } : {}),
  };
  const cellNode: DocNode = {
    capability: cell.blueprint ? BLUEPRINT_CAPABILITY : view.capability!,
    id: nodeId,
    ...(props ? { props } : {}),
    ...(Object.keys(edges).length > 0 ? { edges } : {}),
  };
  const before = (view.before ?? []).map((decoration, index) =>
    toDecorationNode(decoration, `${nodeId}--before-${index}`, cell));
  const after = (view.after ?? []).map((decoration, index) =>
    toDecorationNode(decoration, `${nodeId}--after-${index}`, cell));
  if (before.length === 0 && after.length === 0) return cellNode;
  return {
    capability: PRESENTATION_FRAGMENT_CAPABILITY,
    id: `${nodeId}--decorated`,
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
          serviceRef: matches[0].service,
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
