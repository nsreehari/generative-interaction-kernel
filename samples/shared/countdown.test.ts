import assert from "node:assert/strict";
import { test } from "vitest";

import { formatCountdown } from "./countdown";

test("formatCountdown uses seconds through 59", () => {
  assert.equal(formatCountdown(0), "0");
  assert.equal(formatCountdown(59), "59");
});

test("formatCountdown uses minutes and padded seconds from 60", () => {
  assert.equal(formatCountdown(60), "1:00");
  assert.equal(formatCountdown(300), "5:00");
});
