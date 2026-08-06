import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import type { Json, ResolvedNode } from "@gik/kernel";

import { FileDownload, fileDownloadDefinition } from "../src/primitives/file-download";
import { FileInput, fileInputDefinition } from "../src/primitives/file-input";
import { FileList, fileListDefinition } from "../src/primitives/file-list";
import { primitiveComponentDefinitions, primitiveComponentViews } from "../src/primitives/registry";

function node(capability: string, props: Record<string, unknown>): ResolvedNode {
  return { id: `${capability}-test`, capability, props: props as Record<string, Json>, visible: true, fallback: false, children: [] };
}

const emit = () => undefined;

test("file primitives expose closed declarative contracts", () => {
  assert.equal(fileInputDefinition.validate(fileInputDefinition.materializeTrial().props).ok, true);
  assert.equal(fileDownloadDefinition.validate(fileDownloadDefinition.materializeTrial().props).ok, true);
  assert.equal(fileListDefinition.validate(fileListDefinition.materializeTrial().props).ok, true);
  assert.equal(fileInputDefinition.validate({ unknown: true }).ok, false);
  assert.deepEqual(fileInputDefinition.events, ["select"]);
  assert.deepEqual(fileDownloadDefinition.events, ["download"]);
  assert.deepEqual(fileListDefinition.events, ["select", "download", "remove"]);
  assert.deepEqual(
    (fileInputDefinition.eventContracts.select.payloadSchema.properties as Record<string, { items?: { properties?: Record<string, unknown> } }>).files.items?.properties?.encoding,
    { enum: ["text", "base64"] },
  );
  assert.equal(fileListDefinition.validate({ files: [{ size: "large" }] }).ok, false);
});

test("file primitives are registered in the public primitive catalog", () => {
  for (const id of ["file-input", "file-download", "file-list"] as const) {
    assert.ok(id in primitiveComponentViews);
    assert.ok(id in primitiveComponentDefinitions);
  }
});

test("file input renders button and dropzone variants", () => {
  const button = renderToStaticMarkup(<FileInput node={node("primitive:file-input", { label: "Import", accept: ".json", readAs: "text" })} emit={emit} children={undefined} />);
  const dropzone = renderToStaticMarkup(<FileInput node={node("primitive:file-input", { label: "Drop files", variant: "dropzone", multiple: true })} emit={emit} children={undefined} />);

  assert.match(button, /type="file"/);
  assert.match(button, /accept="\.json"/);
  assert.match(button, />Import</);
  assert.match(dropzone, /role="button"/);
  assert.match(dropzone, /multiple/);
});

test("file download and list render committed file data", () => {
  const download = renderToStaticMarkup(<FileDownload node={node("primitive:file-download", { label: "Export JSON", filename: "sample.json", content: "{}", mediaType: "application/json" })} emit={emit} children={undefined} />);
  const list = renderToStaticMarkup(<FileList node={node("primitive:file-list", { files: [{ name: "report.pdf", size: 2048, url: "/report.pdf" }], removable: true })} emit={emit} children={undefined} />);

  assert.match(download, />Export JSON</);
  assert.match(list, /report\.pdf/);
  assert.match(list, /2\.0 KB/);
  assert.match(list, />Remove</);
});
