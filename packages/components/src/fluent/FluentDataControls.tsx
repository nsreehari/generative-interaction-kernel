import React from "react";
import {
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  List,
  ListItem,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  createTableColumn,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { readProps, type ProjectionView } from "@gik/react";

import { eventContract, type ComponentDescription } from "../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../shared/component";
import { defineFluentComponent } from "./defineFluentComponent";
import { STANDARD_COMPACT_VARIANTS } from "./fluentVariants";
import { fluentOptionSchema, readFluentOptions } from "./readFluentOptions";

type CellValue = string | number | boolean | null;

interface FluentDataColumn {
  id: string;
  label: string;
}

interface FluentDataRow {
  id: string;
  cells: Record<string, CellValue>;
}

const LIST_VARIANTS = [
  {
    value: "standard",
    summary: "Renders a non-selecting Fluent list.",
    useWhen: ["Items are displayed for reading or navigation handled elsewhere"],
  },
  {
    value: "selectable",
    summary: "Enables Fluent single selection unless selectionMode is explicitly authored.",
    useWhen: ["Users choose one or more items from the list"],
  },
  {
    value: "vertical-cards",
    summary: "Renders full-width vertically stacked cards with Fluent single selection.",
    useWhen: ["Users choose an item from a prominent vertical set of options"],
  },
] as const;

const useListStyles = makeStyles({
  verticalCards: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    width: "100%",
  },
  verticalCard: {
    alignItems: "center",
    boxSizing: "border-box",
    width: "100%",
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    "&:hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    '&[aria-selected="true"]': {
      color: tokens.colorBrandForeground2,
      backgroundColor: tokens.colorBrandBackground2,
    },
    '&[aria-selected="true"]:hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
    },
  },
});

function readColumns(value: Json | undefined): FluentDataColumn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((column) => {
    if (!column || typeof column !== "object" || Array.isArray(column)) return [];
    if (typeof column.id !== "string" || typeof column.label !== "string") return [];
    return [{ id: column.id, label: column.label }];
  });
}

function readRows(value: Json | undefined): FluentDataRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.id !== "string") return [];
    const cells = row.cells && typeof row.cells === "object" && !Array.isArray(row.cells)
      ? row.cells as Record<string, CellValue>
      : {};
    return [{ id: row.id, cells }];
  });
}

function readStringArray(value: Json | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function renderCellValue(value: CellValue | undefined): React.ReactNode {
  return value == null ? null : String(value);
}

export const FluentList: ProjectionView = ({ node, emit }) => {
  const styles = useListStyles();
  const props = readProps(node);
  const items = readFluentOptions(node.props.items);
  const isVerticalCards = node.props.variant === "vertical-cards";
  const selectionMode = props.str("selectionMode");
  const resolvedSelectionMode = selectionMode === "single" || selectionMode === "multiselect"
    ? selectionMode
    : node.props.variant === "selectable" || isVerticalCards ? "single" : undefined;
  const selectedItems = readStringArray(node.props.selectedValues);
  return (
    <List
      {...componentRootProps(node, isVerticalCards ? styles.verticalCards : undefined)}
      aria-label={props.str("ariaLabel") || undefined}
      selectionMode={resolvedSelectionMode}
      selectedItems={selectedItems}
      onSelectionChange={(_, data) => void emit("select", { values: [...data.selectedItems].map(String) })}
    >
      {items.map((item) => (
        <ListItem
          key={item.value}
          value={item.value}
          disabledSelection={item.disabled}
          checkmark={isVerticalCards ? null : undefined}
          className={isVerticalCards ? styles.verticalCard : undefined}
        >
          {item.label}
        </ListItem>
      ))}
    </List>
  );
};

export const FluentTable: ProjectionView = ({ node }) => {
  const props = readProps(node);
  const columns = readColumns(node.props.columns);
  const rows = readRows(node.props.rows);
  const size = props.str("size");
  const resolvedSize = size === "extra-small" || size === "small" || size === "medium"
    ? size
    : node.props.variant === "compact" ? "small" : undefined;
  return (
    <Table
      {...componentRootProps(node)}
      aria-label={props.str("ariaLabel") || undefined}
      size={resolvedSize}
    >
      <TableHeader>
        <TableRow>
          {columns.map((column) => <TableHeaderCell key={column.id}>{column.label}</TableHeaderCell>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            {columns.map((column) => <TableCell key={column.id}>{renderCellValue(row.cells[column.id])}</TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export const FluentDataGrid: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const authoredColumns = readColumns(node.props.columns);
  const rows = readRows(node.props.rows);
  const selectionMode = props.str("selectionMode");
  const sortColumn = props.str("sortColumn");
  const sortDirection = props.str("sortDirection");
  const size = props.str("size");
  const resolvedSize = size === "extra-small" || size === "small" || size === "medium"
    ? size
    : node.props.variant === "compact" ? "small" : undefined;
  const columns = authoredColumns.map((column) => createTableColumn<FluentDataRow>({
    columnId: column.id,
    renderHeaderCell: () => column.label,
    renderCell: (row) => renderCellValue(row.cells[column.id]),
  }));
  const selectedItems = new Set(readStringArray(node.props.selectedRowIds));

  return (
    <DataGrid
      {...componentRootProps(node)}
      aria-label={props.str("ariaLabel") || undefined}
      items={rows}
      columns={columns}
      size={resolvedSize}
      getRowId={(row) => row.id}
      {...(selectionMode === "single" || selectionMode === "multiselect"
        ? { selectionMode, selectedItems }
        : {})}
      {...(sortColumn
        ? { sortState: { sortColumn, sortDirection: sortDirection === "descending" ? "descending" : "ascending" } }
        : {})}
      onSelectionChange={(_, data) => void emit("select", { rowIds: [...data.selectedItems].map(String) })}
      onSortChange={(_, data) => void emit("sort", { columnId: String(data.sortColumn), direction: data.sortDirection })}
    >
      <DataGridHeader>
        <DataGridRow>
          {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody<FluentDataRow>>
        {({ item, rowId }) => (
          <DataGridRow<FluentDataRow> key={rowId}>
            {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
          </DataGridRow>
        )}
      </DataGridBody>
    </DataGrid>
  );
};

const stringProperty = { type: "string" } as const;
const columnSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label"],
  properties: { id: stringProperty, label: stringProperty },
} as const;
const cellValueSchema = { type: ["string", "number", "boolean", "null"] } as const;
const rowSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "cells"],
  properties: {
    id: stringProperty,
    cells: { type: "object", additionalProperties: cellValueSchema },
  },
} as const;
const listSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    ariaLabel: stringProperty,
    items: { type: "array", items: fluentOptionSchema },
    selectionMode: { type: "string", enum: ["single", "multiselect"] },
    selectedValues: { type: "array", items: stringProperty },
  },
} as const);
const tableProperties = {
  ariaLabel: stringProperty,
  columns: { type: "array", minItems: 1, items: columnSchema },
  rows: { type: "array", items: rowSchema },
} as const;
const tableSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  required: ["columns", "rows"],
  properties: {
    ...tableProperties,
    size: { type: "string", enum: ["extra-small", "small", "medium"] },
  },
} as const);
const dataGridSchema = withComponentStylePropsSchema({
  type: "object",
  additionalProperties: false,
  required: ["columns", "rows"],
  properties: {
    ...tableProperties,
    selectionMode: { type: "string", enum: ["single", "multiselect"] },
    selectedRowIds: { type: "array", items: stringProperty },
    sortColumn: stringProperty,
    sortDirection: { type: "string", enum: ["ascending", "descending"] },
    size: { type: "string", enum: ["extra-small", "small", "medium"] },
  },
} as const);

const listDescription: ComponentDescription = {
  capability: "fluent:list",
  summary: "Renders a Fluent 2 list with optional controlled item selection.",
  dataProp: "items",
  events: ["select"],
  eventContracts: { select: eventContract("The selected list values change.", { values: { type: "array", items: { type: "string" } } }) },
  semanticTokens: [],
  defaultVariant: "standard",
  variants: LIST_VARIANTS,
  authoring: {
    useWhen: ["A compact sequence of labeled values should be displayed or selected"],
    avoidWhen: ["Values require columns; use table or data-grid"],
    rules: ["Use stable item values", "Use vertical-cards for a prominent full-width selection surface", "Set selectionMode only when selection is required", "Handle select outside the component"],
  },
};
const tableDescription: ComponentDescription = {
  capability: "fluent:table",
  summary: "Renders read-only row and column data with Fluent 2 table semantics.",
  dataProp: "rows",
  events: [],
  semanticTokens: [],
  defaultVariant: "standard",
  variants: STANDARD_COMPACT_VARIANTS,
  authoring: {
    useWhen: ["Structured data needs a read-only tabular presentation"],
    avoidWhen: ["Rows need selection or columns need sorting; use data-grid"],
    rules: ["Provide explicit columns", "Provide each row as a stable id and cells map"],
  },
};
const dataGridDescription: ComponentDescription = {
  capability: "fluent:data-grid",
  summary: "Renders Fluent 2 tabular data with controlled row selection and sorting.",
  dataProp: "rows",
  events: ["select", "sort"],
  eventContracts: {
    select: eventContract("The selected data-grid rows change.", { rowIds: { type: "array", items: { type: "string" } } }),
    sort: eventContract("The data-grid sort changes.", { columnId: { type: "string" }, direction: { enum: ["ascending", "descending"] } }),
  },
  semanticTokens: [],
  defaultVariant: "standard",
  variants: STANDARD_COMPACT_VARIANTS,
  authoring: {
    useWhen: ["Tabular data needs row selection or sortable columns"],
    avoidWhen: ["The table is display-only; use table", "Users need spreadsheet editing"],
    rules: ["Provide explicit columns and stable row ids", "Apply sorting and selection state outside the component"],
  },
};

const trialColumns: Json[] = [{ id: "status", label: "Status" }, { id: "owner", label: "Owner" }];
const trialRows: Json[] = [
  { id: "incident-1", cells: { status: "Open", owner: "SOC" } },
  { id: "incident-2", cells: { status: "Resolved", owner: "IR" } },
];

export const fluentListDefinition = defineFluentComponent(listDescription, listSchema, FluentList, {
  ariaLabel: "Incident states",
  items: [{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }],
});
export const fluentTableDefinition = defineFluentComponent(tableDescription, tableSchema, FluentTable, {
  ariaLabel: "Incident ownership",
  columns: trialColumns,
  rows: trialRows,
});
export const fluentDataGridDefinition = defineFluentComponent(dataGridDescription, dataGridSchema, FluentDataGrid, {
  ariaLabel: "Selectable incidents",
  columns: trialColumns,
  rows: trialRows,
  selectionMode: "single",
  selectedRowIds: ["incident-1"],
  sortColumn: "status",
  sortDirection: "ascending",
});