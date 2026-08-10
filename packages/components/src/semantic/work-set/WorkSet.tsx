import React from "react";
import { Text } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { CollectionBoard, collectionBoardDefinition } from "../../primitives/collection-board";
import { componentRootProps, componentStylePropsSchema, records, textAt, type DataRecord } from "../../shared/component";
import { componentNode, defineComponent, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

export const WORK_SET_VARIANTS = ["board", "queue", "list", "text"] as const;
type WorkSetVariant = typeof WORK_SET_VARIANTS[number];

interface WorkSetSpec {
  title?: string;
  description?: string;
  emptyText?: string;
  density?: "comfortable" | "compact";
  fields: { id: string; title: string; group: string; detail?: string; order?: string };
  groups: Array<{ value: string; label: string }>;
  interaction?: { selection?: "none" | "single"; reorder?: boolean; moveBetweenGroups?: boolean };
}

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  required: ["items", "spec"],
  properties: {
    ...componentStylePropsSchema,
    items: { type: "array", items: { type: "object" } },
    selectedId: { type: "string" },
    variant: { enum: WORK_SET_VARIANTS },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["fields", "groups"],
      properties: {
        title: { type: "string" }, description: { type: "string" }, emptyText: { type: "string" },
        density: { enum: ["comfortable", "compact"] },
        fields: { type: "object", additionalProperties: false, required: ["id", "title", "group"], properties: {
          id: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 }, group: { type: "string", minLength: 1 },
          detail: { type: "string", minLength: 1 }, order: { type: "string", minLength: 1 },
        } },
        groups: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["value", "label"], properties: { value: { type: "string" }, label: { type: "string" } } } },
        interaction: { type: "object", additionalProperties: false, properties: {
          selection: { enum: ["none", "single"] }, reorder: { type: "boolean" }, moveBetweenGroups: { type: "boolean" },
        } },
      },
    },
  },
} as const;

function orderedItems(items: DataRecord[], orderField?: string) {
  return orderField ? [...items].sort((left, right) => Number(textAt(left, orderField)) - Number(textAt(right, orderField))) : items;
}

export const WorkSet: ProjectionView = ({ node, emit }) => {
  const items = records(node.props.items);
  const spec = (node.props.spec ?? {}) as unknown as WorkSetSpec;
  const variant = (node.props.variant ?? "board") as WorkSetVariant;
  if (!spec.fields || !spec.groups || items.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No work items."}</Text>;

  if (variant === "board") {
    return <CollectionBoard node={componentNode(`${node.id}-board`, "primitive:collection-board", {
      items,
      selectedId: node.props.selectedId,
      className: node.props.className,
      style: node.props.style,
      variant: spec.density === "compact" ? "compact" : "standard",
      spec: {
        title: spec.title,
        description: spec.description,
        emptyText: spec.emptyText,
        columns: spec.groups.map((group) => ({ id: group.value, label: group.label })),
        fields: { id: spec.fields.id, title: spec.fields.title, column: spec.fields.group, detail: spec.fields.detail, order: spec.fields.order },
        interaction: { selection: spec.interaction?.selection, reorder: spec.interaction?.reorder, moveBetweenColumns: spec.interaction?.moveBetweenGroups },
      },
    } as Record<string, Json>)} emit={emit} children={undefined} />;
  }

  const ordered = orderedItems(items, spec.fields.order);
  const visible = variant === "queue" ? ordered.filter((item) => textAt(item, spec.fields.group) === spec.groups[0]?.value) : ordered;
  const lines = visible.map((item) => {
    const title = textAt(item, spec.fields.title);
    const detail = spec.fields.detail ? textAt(item, spec.fields.detail) : "";
    return detail && spec.density !== "compact" ? `${title}: ${detail}` : title;
  });
  return <section {...componentRootProps(node)}>{spec.title ? <Text weight="semibold">{spec.title}</Text> : null}<div>{lines.map((line, index) => <Text block key={`${line}-${index}`}>{variant === "text" ? `- ${line}` : line}</Text>)}</div></section>;
};

const description: ComponentDescription = {
  capability: "semantic:work-set",
  summary: "Presents actionable work records as a board, queue, list, or textual projection.",
  dataProp: "items",
  events: ["select", "activate", "reorder", "move"],
  eventContracts: collectionBoardDefinition.eventContracts,
  semanticTokens: [],
  defaultVariant: "board",
  variants: [
    { value: "board", summary: "Work grouped into parallel declared columns.", useWhen: ["Placement across groups matters"] },
    { value: "queue", summary: "Ordered work from the first declared active group.", useWhen: ["Users should focus on the next actionable records"] },
    { value: "list", summary: "A linear scan of all work records.", useWhen: ["Cross-group comparison is secondary"] },
    { value: "text", summary: "Accessible textual work summary.", useWhen: ["Visual layout is unavailable or inappropriate"] },
  ],
  authoring: {
    useWhen: ["Records represent actionable work with stable placement or order"],
    avoidWhen: ["Records are purely informational or encode process steps"],
    rules: ["Use variant for the actual representation", "Put density and interaction configuration in spec", "Persist emitted movement intents outside the component"],
  },
};

export function getWorkSetSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateWorkSet(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema: getWorkSetSchema(), message: "Invalid semantic:work-set props", code: "work-set-schema" }], props as Json);
}
export function materializeWorkSetTrial() {
  return trialNode("semantic:work-set", {
    variant: "board",
    items: [{ id: "investigate", title: "Investigate sign-in", detail: "Review identity telemetry", group: "active", order: 1 }],
    spec: { title: "Response work", density: "comfortable", fields: { id: "id", title: "title", detail: "detail", group: "group", order: "order" }, groups: [{ value: "active", label: "Active" }], interaction: { selection: "single", reorder: true } },
  });
}
export const workSetDefinition = defineComponent({ description, version: "1.0.0", component: WorkSet, getSchema: getWorkSetSchema, validate: validateWorkSet, materializeTrial: materializeWorkSetTrial });