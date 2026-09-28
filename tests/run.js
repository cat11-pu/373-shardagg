import assert from "node:assert";
import { putOf, mergeOf } from "../agg.js";
import { step, close } from "../aggrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { shards: [], merged: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "report", shard: "a", sum: 10, count: 4, low: 1, high: 5 }],
  bad_shard_code: "E_BAD_SHARD", bad_stats_code: "E_BAD_STATS",
  dup_shard_code: "E_DUP_SHARD", empty_code: "E_EMPTY",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("putOf returns a list", () => {
  assert.ok(Array.isArray(putOf([], "a", [1, 1, 1, 1])));
});

check("mergeOf returns a list", () => {
  assert.ok(Array.isArray(mergeOf([])));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
