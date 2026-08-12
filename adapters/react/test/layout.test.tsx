import assert from "node:assert/strict";
import React from "react";
import { test } from "vitest";
import type { ResolvedNode } from "@gik/kernel";

import { renderNode } from "../src/render";
import type { ComponentRegistry, ProjectionView } from "../src/registry";

const Leaf: ProjectionView = ({ node }) => <span>{node.id}</span>;
const Parent: ProjectionView = ({ children, slots }) => (
  <section data-default={React.Children.toArray(children).map((child) => (child as React.ReactElement).props.node.id).join(",")}
    data-leading={(slots?.leading ?? []).map((child) => (child as React.ReactElement).props.node.id).join(",")} />
);

const registry: ComponentRegistry = {
  get: (capability) => capability === "test:parent" ? Parent : Leaf,
  fallback: Leaf,
};

function child(id: string): ResolvedNode {
  return { id, capability: "test:leaf", props: {}, visible: true, fallback: false, children: [] };
}

test("renderNode resolves layout slots by child id while preserving authored order", () => {
  const rendered = renderNode({
    id: "parent",
    capability: "test:parent",
    props: { layout: { slots: [{ key: "second", slot: "leading" }, { key: "first", slot: "leading" }] } },
    visible: true,
    fallback: false,
    children: [child("first"), child("second"), child("third")],
  }, registry, () => {}) as React.ReactElement;
  const projected = Parent(rendered.props) as React.ReactElement;

  assert.equal(projected.props["data-leading"], "first,second");
  assert.equal(projected.props["data-default"], "third");
});

test("renderNode keeps every child in authored order when layout slots are absent", () => {
  const rendered = renderNode({
    id: "parent",
    capability: "test:parent",
    props: {},
    visible: true,
    fallback: false,
    children: [child("first"), child("second"), child("third")],
  }, registry, () => {}) as React.ReactElement;
  const projected = Parent(rendered.props) as React.ReactElement;

  assert.equal(projected.props["data-default"], "first,second,third");
  assert.equal(projected.props["data-leading"], "");
});

test("the explicit children slot uses the same ordered default child sequence", () => {
  const rendered = renderNode({
    id: "parent",
    capability: "test:parent",
    props: { layout: { slots: [{ key: "second", slot: "children" }] } },
    visible: true,
    fallback: false,
    children: [child("first"), child("second"), child("third")],
  }, registry, () => {}) as React.ReactElement;
  const projected = Parent(rendered.props) as React.ReactElement;

  assert.equal(projected.props["data-default"], "first,second,third");
});