import assert from "node:assert/strict";
import { test } from "vitest";

import {
  EditableTable,
  appendEditableRowOnLastRowFocus as packageAppendEditableRowOnLastRowFocus,
  committedEditableRows as packageCommittedEditableRows,
  withTrailingEditableRow as packageWithTrailingEditableRow,
} from "@gik/components/primitives";

import {
  FLOOR_COMPONENTS,
  appendEditableRowOnLastRowFocus,
  committedEditableRows,
  withTrailingEditableRow,
} from "./floorLeaves";

test("floor delegates ui:editable-table to the public EditableTable primitive", () => {
  assert.equal(FLOOR_COMPONENTS["editable-table"], EditableTable);
});

test("floor preserves editable-table helper compatibility exports", () => {
  assert.equal(appendEditableRowOnLastRowFocus, packageAppendEditableRowOnLastRowFocus);
  assert.equal(committedEditableRows, packageCommittedEditableRows);
  assert.equal(withTrailingEditableRow, packageWithTrailingEditableRow);
});
