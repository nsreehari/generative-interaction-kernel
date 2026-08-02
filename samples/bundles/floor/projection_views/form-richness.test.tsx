import assert from "node:assert/strict";
import { test } from "vitest";

import { Form } from "@gik/components/primitives";

import { FLOOR_COMPONENTS } from "./floorLeaves";

test("floor delegates ui:form to the public Form primitive", () => {
  assert.equal(FLOOR_COMPONENTS.form, Form);
});
