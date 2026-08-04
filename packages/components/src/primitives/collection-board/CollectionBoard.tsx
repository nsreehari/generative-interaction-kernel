import React from "react";
import { Badge, Button, Card, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import type { ProjectionView } from "@gik/react";

import {
  collectionBoardColumnItems,
  moveCollectionBoardItem,
  type CollectionBoardPlacement,
} from "../../shared/collectionBoard";
import { componentRootProps, componentStylePropsSchema, records, textAt, type DataRecord } from "../../shared/component";
import { defineComponent, eventContract, trialNode, type ComponentDescription, type ComponentValidationReport } from "../../shared/definition";

export const COLLECTION_BOARD_VARIANTS = ["standard", "compact"] as const;
type CollectionBoardVariant = typeof COLLECTION_BOARD_VARIANTS[number];

interface CollectionBoardColumn {
  id: string;
  label: string;
}

interface CollectionBoardSpec {
  title?: string;
  description?: string;
  emptyText?: string;
  columns: CollectionBoardColumn[];
  fields: {
    id: string;
    title: string;
    column: string;
    detail?: string;
    order?: string;
  };
  interaction?: {
    selection?: "none" | "single";
    reorder?: boolean;
    moveBetweenColumns?: boolean;
  };
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
    variant: { enum: COLLECTION_BOARD_VARIANTS },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["columns", "fields"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        emptyText: { type: "string" },
        columns: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label"],
            properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } },
          },
        },
        fields: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "column"],
          properties: {
            id: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            column: { type: "string", minLength: 1 },
            detail: { type: "string", minLength: 1 },
            order: { type: "string", minLength: 1 },
          },
        },
        interaction: {
          type: "object",
          additionalProperties: false,
          properties: {
            selection: { enum: ["none", "single"] },
            reorder: { type: "boolean" },
            moveBetweenColumns: { type: "boolean" },
          },
        },
      },
    },
  },
} as const;

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalL, minWidth: 0 },
  compactRoot: { gap: tokens.spacingVerticalM },
  header: { display: "grid", gap: tokens.spacingVerticalXXS },
  description: { color: tokens.colorNeutralForeground3 },
  viewport: { overflowX: "auto", minWidth: 0 },
  columns: { display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(15rem, 1fr)", gap: tokens.spacingHorizontalL, minWidth: "max-content", alignItems: "start" },
  compactColumns: { gridAutoColumns: "minmax(12rem, 1fr)", gap: tokens.spacingHorizontalM },
  column: { display: "grid", gap: tokens.spacingVerticalM, width: "100%", minWidth: 0, padding: tokens.spacingHorizontalM, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  columnHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS },
  items: { display: "grid", gap: tokens.spacingVerticalS, minHeight: "3rem" },
  item: { display: "grid", gap: tokens.spacingVerticalS, minWidth: 0, cursor: "default" },
  compactItem: { gap: tokens.spacingVerticalXXS },
  selectedItem: { outline: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, outlineOffset: "1px" },
  detail: { color: tokens.colorNeutralForeground3 },
  controls: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  empty: { color: tokens.colorNeutralForeground3 },
});

function initialPlacements(items: DataRecord[], spec: CollectionBoardSpec): CollectionBoardPlacement[] {
  const placements = items.map((item) => ({ item, itemId: textAt(item, spec.fields.id), columnId: textAt(item, spec.fields.column) }));
  if (spec.fields.order) placements.sort((left, right) => Number(textAt(left.item, spec.fields.order)) - Number(textAt(right.item, spec.fields.order)));
  return placements.map(({ itemId, columnId }) => ({ itemId, columnId }));
}

export const CollectionBoard: ProjectionView = ({ node, emit }) => {
  const styles = useStyles();
  const items = records(node.props.items);
  const spec = (node.props.spec ?? {}) as unknown as CollectionBoardSpec;
  const variant = COLLECTION_BOARD_VARIANTS.includes(node.props.variant as CollectionBoardVariant) ? node.props.variant as CollectionBoardVariant : "standard";
  const placementSignature = JSON.stringify([items, spec.fields, spec.columns]);
  const authoredPlacements = React.useMemo(() => spec.fields && spec.columns ? initialPlacements(items, spec) : [], [placementSignature]);
  const [placements, setPlacements] = React.useState(authoredPlacements);
  const [localSelectedId, setLocalSelectedId] = React.useState(typeof node.props.selectedId === "string" ? node.props.selectedId : "");
  React.useEffect(() => setPlacements(authoredPlacements), [authoredPlacements]);
  React.useEffect(() => setLocalSelectedId(typeof node.props.selectedId === "string" ? node.props.selectedId : ""), [node.props.selectedId]);

  if (!spec.fields || !spec.columns || items.length === 0) return <Text {...componentRootProps(node)}>{spec.emptyText ?? "No board items."}</Text>;

  const byId = new Map(items.map((item) => [textAt(item, spec.fields.id), item]));
  const canSelect = spec.interaction?.selection === "single";
  const canReorder = spec.interaction?.reorder === true;
  const canMove = spec.interaction?.moveBetweenColumns === true;
  const selectedId = typeof node.props.selectedId === "string" ? node.props.selectedId : localSelectedId;

  const commitMove = (itemId: string, columnId: string, index: number) => {
    const result = moveCollectionBoardItem(placements, itemId, columnId, index);
    if (!result.move) return;
    const movedAcrossColumns = result.move.fromColumnId !== result.move.toColumnId;
    if ((movedAcrossColumns && !canMove) || (!movedAcrossColumns && !canReorder)) return;
    setPlacements(result.placements);
    void emit(movedAcrossColumns ? "move" : "reorder", { ...result.move });
  };

  return <section {...componentRootProps(node, mergeClasses(styles.root, variant === "compact" && styles.compactRoot))}>
    {spec.title || spec.description ? <header className={styles.header}>{spec.title ? <Text weight="semibold" size={500}>{spec.title}</Text> : null}{spec.description ? <Text className={styles.description}>{spec.description}</Text> : null}</header> : null}
    <div className={styles.viewport}>
      <div className={mergeClasses(styles.columns, variant === "compact" && styles.compactColumns)}>
        {spec.columns.map((column, columnIndex) => {
          const members = collectionBoardColumnItems(placements, column.id);
          return <section className={styles.column} key={column.id} aria-label={column.label}>
            <div className={styles.columnHeader}><Text weight="semibold">{column.label}</Text><Badge appearance="outline">{members.length}</Badge></div>
            <div className={styles.items}>{members.length === 0 ? <Text className={styles.empty} size={200}>No items</Text> : members.map((placement, itemIndex) => {
              const item = byId.get(placement.itemId);
              if (!item) return null;
              const previousColumn = spec.columns[columnIndex - 1];
              const nextColumn = spec.columns[columnIndex + 1];
              return <Card
                className={mergeClasses(styles.item, variant === "compact" && styles.compactItem, selectedId === placement.itemId && styles.selectedItem)}
                appearance="outline"
                key={placement.itemId}
                tabIndex={canSelect ? 0 : undefined}
                aria-selected={canSelect ? selectedId === placement.itemId : undefined}
                onClick={() => { if (canSelect) { setLocalSelectedId(placement.itemId); void emit("select", { itemId: placement.itemId }); } }}
                onDoubleClick={() => void emit("activate", { itemId: placement.itemId })}
                onKeyDown={(event) => { if (event.key === "Enter") void emit("activate", { itemId: placement.itemId }); }}
              >
                <Text weight="semibold">{textAt(item, spec.fields.title)}</Text>
                {variant === "standard" && spec.fields.detail && textAt(item, spec.fields.detail) ? <Text className={styles.detail} size={200}>{textAt(item, spec.fields.detail)}</Text> : null}
                {(canMove || canReorder) ? <div className={styles.controls}>
                  {canReorder && itemIndex > 0 ? <Button appearance="subtle" size="small" onClick={(event) => { event.stopPropagation(); commitMove(placement.itemId, column.id, itemIndex - 1); }}>Move up</Button> : null}
                  {canReorder && itemIndex < members.length - 1 ? <Button appearance="subtle" size="small" onClick={(event) => { event.stopPropagation(); commitMove(placement.itemId, column.id, itemIndex + 1); }}>Move down</Button> : null}
                  {canMove && previousColumn ? <Button appearance="subtle" size="small" onClick={(event) => { event.stopPropagation(); commitMove(placement.itemId, previousColumn.id, collectionBoardColumnItems(placements, previousColumn.id).length); }}>Move left</Button> : null}
                  {canMove && nextColumn ? <Button appearance="subtle" size="small" onClick={(event) => { event.stopPropagation(); commitMove(placement.itemId, nextColumn.id, collectionBoardColumnItems(placements, nextColumn.id).length); }}>Move right</Button> : null}
                </div> : null}
              </Card>;
            })}</div>
          </section>;
        })}
      </div>
    </div>
  </section>;
};

const description: ComponentDescription = {
  capability: "primitive:collection-board",
  summary: "Arranges mapped records in declared columns and emits selection, activation, reorder, and cross-column move intents.",
  dataProp: "items",
  events: ["select", "activate", "reorder", "move"],
  eventContracts: {
    select: eventContract("The selected board item changes.", { itemId: { type: "string" } }),
    activate: eventContract("The user activates a board item.", { itemId: { type: "string" } }),
    reorder: eventContract("An item moves within its current column.", { itemId: { type: "string" }, fromColumnId: { type: "string" }, toColumnId: { type: "string" }, fromIndex: { type: "integer" }, toIndex: { type: "integer" } }),
    move: eventContract("An item moves to another column.", { itemId: { type: "string" }, fromColumnId: { type: "string" }, toColumnId: { type: "string" }, fromIndex: { type: "integer" }, toIndex: { type: "integer" } }),
  },
  semanticTokens: [],
  defaultVariant: "standard",
  variants: [
    { value: "standard", summary: "Full board cards with titles, details, and enabled interaction controls.", useWhen: ["The board is a primary work surface", "Item detail should remain visible"] },
    { value: "compact", summary: "Dense title-only cards with the same interaction contract.", useWhen: ["Many cards share the board", "Column state matters more than item detail"] },
  ],
  authoring: {
    useWhen: ["Records occupy one of several declared columns", "Users may select, reorder, or move records between columns"],
    avoidWhen: ["Columns encode tabular fields rather than item groups", "Workflow transition rules must be inferred by the component"],
    rules: ["Provide stable unique item IDs", "Declare every referenced column", "Use interaction only for mechanics the host handles", "Persist emitted move and reorder intents outside the component"],
  },
};

export function getCollectionBoardSchema(): Record<string, unknown> { return schema as unknown as Record<string, unknown>; }
export function validateCollectionBoard(props: unknown): ComponentValidationReport {
  const report = runDeclarativeValidators([{ kind: "ajv-schema", schema: getCollectionBoardSchema(), message: "Invalid primitive:collection-board props", code: "collection-board-schema" }], props as Json);
  if (!report.ok) return report;
  const value = props as { items: DataRecord[]; spec: CollectionBoardSpec };
  const columnIds = value.spec.columns.map((column) => column.id);
  const itemIds = value.items.map((item) => textAt(item, value.spec.fields.id));
  const invalid = new Set(columnIds).size !== columnIds.length
    || new Set(itemIds).size !== itemIds.length
    || value.items.some((item) => !columnIds.includes(textAt(item, value.spec.fields.column)));
  if (invalid) {
    report.ok = false;
    report.errors.push({ detail: "Collection board columns and item IDs must be unique, and every item must reference a declared column", code: "collection-board-references" });
  }
  return report;
}
export function materializeCollectionBoardTrial() {
  return trialNode("primitive:collection-board", {
    variant: "standard",
    items: [
      { id: "investigate", title: "Investigate sign-in", detail: "Review identity telemetry", column: "active", order: 1 },
      { id: "contain", title: "Contain account", detail: "Disable affected credentials", column: "planned", order: 1 },
    ],
    spec: {
      title: "Response work",
      description: "Operational items grouped by current placement",
      columns: [{ id: "planned", label: "Planned" }, { id: "active", label: "Active" }, { id: "complete", label: "Complete" }],
      fields: { id: "id", title: "title", detail: "detail", column: "column", order: "order" },
      interaction: { selection: "single", reorder: true, moveBetweenColumns: true },
    },
  });
}
export const collectionBoardDefinition = defineComponent({ description, version: "1.0.0", component: CollectionBoard, getSchema: getCollectionBoardSchema, validate: validateCollectionBoard, materializeTrial: materializeCollectionBoardTrial });
