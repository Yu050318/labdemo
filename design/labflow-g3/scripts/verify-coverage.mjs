import assert from "node:assert/strict";
import { PAGE_IDS, GLOBAL_STATES, pageRegistry } from "../src/pageRegistry.js";

const expectedPages = [
  "A01", "A02", "A03", "O01", "D01", "S01", "S02", "W01", "W02", "W03",
  "W04", "K01", "K02", "K03", "T01", "N01", "H01", "H02", "M01", "P01",
  "X01", "R01", "C01",
];

const expectedStates = [
  "normal", "loading", "empty", "error", "disabled", "offline", "conflict",
  "notification-unavailable", "account-pending-deletion", "dense",
];

assert.deepEqual(PAGE_IDS, expectedPages, "Page IDs must match the frozen 23-page list");
assert.deepEqual(GLOBAL_STATES, expectedStates, "Global states must match G3 QA inputs");

for (const id of expectedPages) {
  assert.equal(typeof pageRegistry[id]?.render, "function", `${id} must have a renderer`);
  assert.ok(pageRegistry[id]?.title, `${id} must have a title`);
}

console.log(`PASS ${PAGE_IDS.length}/23 pages`);
console.log(`PASS ${GLOBAL_STATES.length}/${expectedStates.length} global states`);
