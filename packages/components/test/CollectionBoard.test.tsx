import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import {
  CollectionBoard,
  collectionBoardDefinition,
  materializeCollectionBoardTrial,
  validateCollectionBoard,
} from "../src/primitives/collection-board";
import { moveCollectionBoardItem } from "../src/shared/collectionBoard";

test("collection board exposes a closed density contract", () => {
  assert.equal(collectionBoardDefinition.capability, "primitive:collection-board");
  assert.equal(collectionBoardDefinition.defaultVariant, "standard");
  assert.deepEqual(collectionBoardDefinition.variants.map((variant) => variant.value), ["standard", "compact"]);
  assert.deepEqual(collectionBoardDefinition.events, ["select", "activate", "reorder", "move"]);
});

test("collection board validates identities and declared columns", () => {
  const trial = materializeCollectionBoardTrial();
  assert.equal(validateCollectionBoard(trial.props).ok, true);

  const invalid = structuredClone(trial.props);
  (invalid.items as Array<Record<string, unknown>>)[0].column = "missing";
  const report = validateCollectionBoard(invalid);
  assert.equal(report.ok, false);
  assert.match(report.errors.map((error) => error.detail).join(" "), /declared column/);
});

test("collection board renders columns and mapped cards", () => {
  const trial = materializeCollectionBoardTrial();
  const markup = renderToStaticMarkup(<CollectionBoard node={trial} emit={() => undefined} children={undefined} />);
  assert.match(markup, /Response work/);
  assert.match(markup, /Planned/);
  assert.match(markup, /Investigate sign-in/);
  assert.match(markup, /Move left|Move right/);
});

test("collection board placement mechanics preserve stable item identity", () => {
  const placements = [
    { itemId: "a", columnId: "planned" },
    { itemId: "b", columnId: "planned" },
    { itemId: "c", columnId: "active" },
  ];
  const result = moveCollectionBoardItem(placements, "b", "active", 0);
  assert.deepEqual(result.move, { itemId: "b", fromColumnId: "planned", toColumnId: "active", fromIndex: 1, toIndex: 0 });
  assert.deepEqual(result.placements, [
    { itemId: "a", columnId: "planned" },
    { itemId: "b", columnId: "active" },
    { itemId: "c", columnId: "active" },
  ]);
});
