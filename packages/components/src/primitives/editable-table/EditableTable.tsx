import React from "react";
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import type { Json } from "@gik/kernel";
import { runDeclarativeValidators } from "@gik/evaluators";
import { readProps, type ProjectionView } from "@gik/react";

import {
  defineComponent,
  eventContract,
  trialNode,
  type ComponentDescription,
  type ComponentValidationReport,
} from "../../shared/definition";
import { componentRootProps, withComponentStylePropsSchema } from "../../shared/component";

interface EditableTableSpec {
  schema?: { properties?: Record<string, Record<string, unknown>> };
  columns?: string[];
  addRow?: boolean;
  deleteRow?: boolean;
  placeholder?: string;
}

const useStyles = makeStyles({
  root: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0 },
  overflow: { overflowX: "auto" },
  table: { width: "100%" },
  input: { width: "100%" },
  actionCell: { width: "1%", whiteSpace: "nowrap" },
  actions: { display: "flex", justifyContent: "flex-end", gap: tokens.spacingHorizontalS },
  placeholder: { color: tokens.colorNeutralForeground3 },
});

function editableRowsFrom(source: unknown[]): Array<Record<string, unknown>> {
  return source.map((row) => row && typeof row === "object" && !Array.isArray(row)
    ? { ...(row as Record<string, unknown>) }
    : { value: row ?? "" });
}

function blankEditableRow(columns: string[]): Record<string, unknown> {
  return Object.fromEntries(columns.map((column) => [column, ""]));
}

export function isEmptyEditableRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every((value) => value == null || (typeof value === "string" && value.trim() === ""));
}

export function withTrailingEditableRow(rows: Array<Record<string, unknown>>, columns: string[]): Array<Record<string, unknown>> {
  return rows.length > 0 && isEmptyEditableRow(rows[rows.length - 1]) ? rows : [...rows, blankEditableRow(columns)];
}

export function committedEditableRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.filter((row) => !isEmptyEditableRow(row));
}

export function appendEditableRowOnLastRowFocus(rows: Array<Record<string, unknown>>, columns: string[], rowIndex: number): Array<Record<string, unknown>> {
  return rowIndex === rows.length - 1 ? [...rows, blankEditableRow(columns)] : rows;
}

export function editableTableColumns(spec: EditableTableSpec, rows: Array<Record<string, unknown>>): string[] {
  if (Array.isArray(spec.columns) && spec.columns.length > 0) return spec.columns.map(String);
  const schemaColumns = Object.keys(spec.schema?.properties ?? {});
  if (schemaColumns.length > 0) return schemaColumns;
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
  return [...seen];
}

export const EditableTable: ProjectionView = ({ node, emit }) => {
  const props = readProps(node);
  const styles = useStyles();
  const spec = props.obj<EditableTableSpec>("spec", {});
  const incomingRows = editableRowsFrom(props.list<unknown>("rows").length > 0 ? props.list<unknown>("rows") : props.list<unknown>("baseRows"));
  const columns = editableTableColumns(spec, incomingRows);
  const incomingSignature = JSON.stringify(incomingRows);
  const columnsSignature = columns.join("\u0000");
  const initialRows = React.useMemo(() => withTrailingEditableRow(incomingRows, columns), [incomingSignature, columnsSignature]);
  const [rows, setRows] = React.useState(initialRows);
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    setRows(initialRows);
    setDirty(false);
  }, [initialRows]);
  const canAdd = spec.addRow !== false;
  const canDelete = spec.deleteRow !== false;
  const schemaProperties = spec.schema?.properties ?? {};
  const updateCell = (rowIndex: number, column: string, value: string, numeric: boolean) => {
    setRows((current) => current.map((row, index) => index === rowIndex
      ? { ...row, [column]: numeric && value !== "" ? Number.parseFloat(value) : value }
      : row));
    setDirty(true);
  };
  const deleteRow = (rowIndex: number) => {
    setRows((current) => withTrailingEditableRow(current.filter((_, index) => index !== rowIndex), columns));
    setDirty(true);
  };

  if (columns.length === 0 && !canAdd) return <Text className={styles.placeholder}>{spec.placeholder ?? "No data"}</Text>;

  return <div {...componentRootProps(node, styles.root, "gx-editable-table")}>
    <div className={styles.overflow}>
      <Table className={mergeClasses(styles.table, "gx-table", "gx-table-editable")} aria-label={props.str("ariaLabel", "Editable table")}>
        <TableHeader><TableRow>
          {columns.map((column) => <TableHeaderCell key={column}>{String(schemaProperties[column]?.title ?? column)}</TableHeaderCell>)}
          {canDelete ? <TableHeaderCell className={styles.actionCell}>Actions</TableHeaderCell> : null}
        </TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 ? <TableRow><TableCell colSpan={columns.length + (canDelete ? 1 : 0)}><Text className={styles.placeholder}>{spec.placeholder ?? "No data"}</Text></TableCell></TableRow>
            : rows.map((row, rowIndex) => <TableRow key={rowIndex}>
              {columns.map((column) => {
                const field = schemaProperties[column] ?? {};
                const numeric = field.type === "number" || field.type === "integer" || typeof row[column] === "number";
                return <TableCell key={column}><Input className={styles.input} type={numeric ? "number" : "text"} step={numeric ? "any" : undefined} value={row[column] == null ? "" : String(row[column])} aria-label={`${String(field.title ?? column)}, row ${rowIndex + 1}`} onFocus={rowIndex === rows.length - 1 ? () => setRows((current) => appendEditableRowOnLastRowFocus(current, columns, rowIndex)) : undefined} onChange={(_, data) => updateCell(rowIndex, column, data.value, numeric)} /></TableCell>;
              })}
              {canDelete ? <TableCell className={styles.actionCell}><Button className="gx-cell-delete" appearance="subtle" size="small" aria-label={`remove row ${rowIndex + 1}`} title={`Remove row ${rowIndex + 1}`} onClick={() => deleteRow(rowIndex)}>Remove</Button></TableCell> : null}
            </TableRow>)}
        </TableBody>
      </Table>
    </div>
    {(canAdd || dirty) ? <div className={mergeClasses(styles.actions, "gx-panel-actions")}>
      {canAdd ? <Button className="gx-btn" onClick={() => { setRows((current) => [...current, blankEditableRow(columns)]); setDirty(true); }}>+ Add row</Button> : null}
      {dirty ? <Button onClick={() => { setRows(initialRows); setDirty(false); }}>{props.str("discardLabel", "Discard")}</Button> : null}
      {dirty ? <Button appearance="primary" onClick={() => { void emit("save", { rows: committedEditableRows(rows) }); setDirty(false); }}>{props.str("saveLabel", "Save")}</Button> : null}
    </div> : null}
  </div>;
};

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    spec: { type: "object" }, rows: { type: "array" }, baseRows: { type: "array" },
    saveLabel: { type: "string" }, discardLabel: { type: "string" }, ariaLabel: { type: "string" },
  },
} as const;

const description: ComponentDescription = {
  capability: "primitive:editable-table",
  summary: "Renders a committed row editor with Fluent 2 table, input, and action controls.",
  dataProp: "rows", events: ["save"], semanticTokens: [], variants: [],
  eventContracts: { save: eventContract("The user commits the edited rows.", { rows: { type: "array", items: { type: "object" } } }) },
  authoring: {
    useWhen: ["Users edit a small tabular collection and explicitly commit or discard the draft"],
    avoidWhen: ["Rows are read-only", "The dataset requires virtualization or spreadsheet formulas"],
    rules: ["Declare columns or a property schema when rows may be empty", "Handle save payload rows", "Keep persistence outside the component"],
  },
};

const publicSchema = withComponentStylePropsSchema(schema);

export function validateEditableTable(props: unknown): ComponentValidationReport {
  return runDeclarativeValidators([{ kind: "ajv-schema", schema: publicSchema, message: "Invalid primitive:editable-table props", code: "primitive-editable-table-schema" }], props as Json);
}

export function materializeEditableTableTrial() {
  return trialNode("primitive:editable-table", {
    spec: { schema: { properties: { name: { type: "string", title: "Name" }, amount: { type: "number", title: "Amount" } } } },
    rows: [{ name: "Budget", amount: 3 }],
  });
}

export const editableTableDefinition = defineComponent({
  description,
  version: "1.0.0",
  component: EditableTable,
  getSchema: () => publicSchema,
  validate: validateEditableTable,
  materializeTrial: materializeEditableTableTrial,
});