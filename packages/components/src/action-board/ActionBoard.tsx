import React from "react";
import { Badge, Button, Card, CardHeader, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import { trialNode, type ComponentDescription, type ComponentValidationReport, type DeclarativeComponentDefinition } from "../definition";
import { componentRootProps, componentStylePropsSchema, records, textAt, type BadgeColor, type DataRecord } from "../shared";

export const ACTION_BOARD_SEMANTIC_TOKENS = ["urgent", "active", "planned", "complete", "blocked", "neutral"] as const;
export const ACTION_BOARD_VARIANTS = ["board", "list"] as const;
type ActionToken = typeof ACTION_BOARD_SEMANTIC_TOKENS[number];
type ActionBoardVariant = typeof ACTION_BOARD_VARIANTS[number];
const actionBoardPropsSchema = {
  $schema: "http://json-schema.org/draft-07/schema#", type: "object", additionalProperties: false, required: ["items", "spec"],
  properties: {
    ...componentStylePropsSchema,
    items: { type: "array", items: { type: "object" } }, selectedId: { type: "string" },
    variant: { enum: ACTION_BOARD_VARIANTS },
    spec: { type: "object", additionalProperties: false, required: ["fields", "columns"], properties: {
      title: { type: "string" }, description: { type: "string" }, emptyText: { type: "string" },
      fields: { type: "object", additionalProperties: false, required: ["id", "title", "group"], properties: { id: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 }, detail: { type: "string", minLength: 1 }, group: { type: "string", minLength: 1 }, status: { type: "string", minLength: 1 }, category: { type: "string", minLength: 1 }, order: { type: "string", minLength: 1 } } },
      columns: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["value", "label"], properties: { value: { type: "string" }, label: { type: "string" }, token: { enum: ACTION_BOARD_SEMANTIC_TOKENS } } } },
      toneMap: { type: "object", additionalProperties: { enum: ACTION_BOARD_SEMANTIC_TOKENS } },
      actions: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string" }, label: { type: "string" }, appearance: { enum: ["primary", "secondary", "subtle"] } } } },
    } },
  },
} as const;
type ActionSpec = { title?: string; description?: string; emptyText?: string; fields: { id: string; title: string; detail?: string; group: string; status?: string; category?: string; order?: string }; columns: Array<{ value: string; label: string; token?: ActionToken }>; toneMap?: Record<string, ActionToken>; actions?: Array<{ id: string; label: string; appearance?: "primary" | "secondary" | "subtle" }> };
const useStyles = makeStyles({ root: { display: "grid", gap: tokens.spacingVerticalL }, heading: { display: "grid", gap: tokens.spacingVerticalXXS }, columns: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))", gap: tokens.spacingHorizontalL }, listColumns: { gridTemplateColumns: "minmax(0, 1fr)" }, column: { display: "grid", gap: tokens.spacingVerticalM, alignContent: "start" }, columnHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: tokens.spacingHorizontalS }, items: { display: "grid", gap: tokens.spacingVerticalS }, item: { display: "grid", gap: tokens.spacingVerticalS }, titleRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexWrap: "wrap" }, detail: { color: tokens.colorNeutralForeground3 }, actions: { display: "flex", gap: tokens.spacingHorizontalS, flexWrap: "wrap" } });
function tokenColor(token: ActionToken): BadgeColor { if (token === "urgent" || token === "blocked") return "danger"; if (token === "active") return "brand"; if (token === "planned") return "warning"; if (token === "complete") return "success"; return "informative"; }
function ordered(items: DataRecord[], field?: string) { return field ? [...items].sort((left, right) => Number(textAt(left, field)) - Number(textAt(right, field))) : items; }
export const ActionBoard: ProjectionView = ({ node, emit }) => {
  const styles = useStyles(); const items = records(node.props.items); const spec = (node.props.spec ?? {}) as ActionSpec;
  const variant = (node.props.variant ?? "board") as ActionBoardVariant;
  if (!spec.fields || !spec.columns || items.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No actions."}</Text>;
  return <section {...componentRootProps(node, styles.root)}>{spec.title || spec.description ? <header className={styles.heading}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text>{spec.description}</Text> : null}</header> : null}<div className={mergeClasses(styles.columns, variant === "list" && styles.listColumns)}>{spec.columns.map((column) => {
    const members = ordered(items.filter((item) => textAt(item, spec.fields.group) === column.value), spec.fields.order);
    return <section className={styles.column} key={column.value}><div className={styles.columnHead}><Text weight="semibold">{column.label}</Text><Badge appearance="tint" color={column.token ? tokenColor(column.token) : undefined}>{members.length}</Badge></div><div className={styles.items}>{members.map((item, index) => {
      const id = textAt(item, spec.fields.id) || String(index); const status = textAt(item, spec.fields.status); const token = spec.toneMap?.[status];
      return <Card className={styles.item} appearance={node.props.selectedId === id ? "filled-alternative" : "outline"} key={id}><CardHeader header={<div className={styles.titleRow}>{spec.fields.category && textAt(item, spec.fields.category) ? <Badge appearance="outline">{textAt(item, spec.fields.category)}</Badge> : null}<Text weight="semibold">{textAt(item, spec.fields.title)}</Text>{token ? <Badge appearance="tint" color={tokenColor(token)}>{status}</Badge> : null}</div>} />{spec.fields.detail && textAt(item, spec.fields.detail) ? <Text className={styles.detail}>{textAt(item, spec.fields.detail)}</Text> : null}{spec.actions?.length ? <div className={styles.actions}>{spec.actions.map((action) => <Button key={action.id} size="small" appearance={action.appearance ?? "secondary"} onClick={() => emit("action", { actionId: action.id, id, item })}>{action.label}</Button>)}</div> : null}</Card>;
    })}</div></section>;
  })}</div></section>;
};
const description: ComponentDescription = { capability: "semantic:action-board", summary: "Groups actionable records into declarative workflow columns and emits semantic actions.", dataProp: "items", events: ["action"], semanticTokens: ACTION_BOARD_SEMANTIC_TOKENS, defaultVariant: "board", variants: [{ value: "board", summary: "Multi-column workflow board organized by declared groups.", useWhen: ["Groups represent parallel lanes or workflow stages", "Horizontal comparison between groups matters"] }, { value: "list", summary: "Single-column action flow preserving declared group sections.", useWhen: ["Horizontal space is constrained", "Users should scan actions from top to bottom"] }], authoring: { useWhen: ["Records represent actions grouped by workflow or urgency", "Users need to invoke consistent operations on actions"], avoidWhen: ["Records are informational only; use list or entity-constellation", "Users need free-form row editing; use editable-table"], rules: ["Map stable identity, title, and group fields", "Declare every visible column", "Choose only a declared variant", "Declare actions as semantic IDs and route emitted events in the GIK document"] } };
export function describeActionBoard() { return description; }
export function getActionBoardSchema(): Record<string, unknown> { return actionBoardPropsSchema as unknown as Record<string, unknown>; }
export function validateActionBoard(props: unknown): ComponentValidationReport { return runDeclarativeValidators([{ kind: "ajv-schema", schema: getActionBoardSchema(), message: "Invalid semantic:action-board props", code: "semantic-action-board-schema" }], props as Json); }
export function materializeActionBoardTrial() { return trialNode("semantic:action-board", { variant: "board", items: [{ key: "a1", title: "Disable account", detail: "Contain the affected identity", lane: "now", state: "ready", category: "containment" }], spec: { title: "Action board", fields: { id: "key", title: "title", detail: "detail", group: "lane", status: "state", category: "category" }, columns: [{ value: "now", label: "Immediate", token: "urgent" }], toneMap: { ready: "active" }, actions: [{ id: "open", label: "Open", appearance: "primary" }] } }); }
export const actionBoardDefinition: DeclarativeComponentDefinition = { capability: description.capability, version: "1.1.0", summary: description.summary, dataProp: description.dataProp, events: description.events, semanticTokens: description.semanticTokens, defaultVariant: description.defaultVariant, variants: description.variants, authoring: description.authoring, component: ActionBoard, describe: describeActionBoard, getSchema: getActionBoardSchema, validate: validateActionBoard, materializeTrial: materializeActionBoardTrial };