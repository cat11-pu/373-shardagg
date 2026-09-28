// aggrun.js：按处理预算处理并留账；收尾不限预算把账做完
import { putOf, mergeOf } from "./agg.js";

function isInt(value) {
  return typeof value === "number" && Number.isInteger(value);
}

function codes(spec) {
  return {
    event: (spec && spec.event_error_code) || "E_BAD_EVENT",
    shard: (spec && spec.bad_shard_code) || "E_BAD_SHARD",
    stats: (spec && spec.bad_stats_code) || "E_BAD_STATS",
    dup: (spec && spec.dup_shard_code) || "E_DUP_SHARD",
    empty: (spec && spec.empty_code) || "E_EMPTY"
  };
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

// 事件规范编码：report -> ["report", 名, 和, 个数, 低, 高]，merge -> ["merge"]。
// 台账与已处理去重都用这份编码，保证重放不新增、不同跑法指纹一致。
function encode(event) {
  if (event && event.kind === "merge") return ["merge"];
  if (event && event.kind === "report") {
    return ["report", event.shard, event.sum, event.count, event.low, event.high];
  }
  return [event && event.kind];
}

function sameTuple(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function hasTuple(list, tuple) {
  return list.some(function (item) { return sameTuple(item, tuple); });
}

// 结构先校验：事件形态 -> 分片名 -> 统计值。
function judge(tuple, cc) {
  if (tuple[0] === "merge") return;
  if (tuple[0] !== "report") fail(cc.event);
  if (typeof tuple[1] !== "string") fail(cc.event);
  if (tuple[1].length === 0) fail(cc.shard);
  if (!isInt(tuple[2]) || !isInt(tuple[3]) || !isInt(tuple[4]) || !isInt(tuple[5])) {
    fail(cc.stats);
  }
  if (tuple[3] <= 0) fail(cc.stats);
  if (tuple[4] > tuple[5]) fail(cc.stats);
}

// 按当前分片表判：重复上报、空表合并。
function applyEvent(state, tuple, cc) {
  if (tuple[0] === "merge") {
    if (state.shards.length === 0) fail(cc.empty);
    return {
      shards: state.shards,
      merged: state.merged.concat([mergeOf(state.shards)]),
      ledger: state.ledger,
      applied: state.applied.concat([tuple])
    };
  }
  if (state.shards.some(function (row) { return row[0] === tuple[1]; })) {
    fail(cc.dup);
  }
  return {
    shards: putOf(state.shards, tuple[1], [tuple[2], tuple[3], tuple[4], tuple[5]]),
    merged: state.merged,
    ledger: state.ledger,
    applied: state.applied.concat([tuple])
  };
}

function run(spec, budget) {
  const cc = codes(spec);
  const state = (spec && spec.state) || {};
  let shards = (state.shards || []).map(function (row) { return [row[0], row[1].slice()]; });
  let merged = (state.merged || []).map(function (row) { return row.slice(); });
  let applied = (state.applied || []).map(function (tuple) { return tuple.slice(); });
  const queue = (state.ledger || []).map(function (tuple) { return tuple.slice(); });
  for (const event of (spec && spec.events) || []) {
    queue.push(encode(event));
  }
  const judgedBound = queue.length;
  let ledger = [];
  let served = 0;
  let judged = 0;
  let left = budget;
  for (const tuple of queue) {
    if (left <= 0) {
      ledger.push(tuple);
      continue;
    }
    judged += 1;
    judge(tuple, cc);
    if (hasTuple(applied, tuple)) continue;
    const next = applyEvent({ shards: shards, merged: merged, ledger: ledger, applied: applied }, tuple, cc);
    shards = next.shards;
    merged = next.merged;
    applied = next.applied;
    served += 1;
    left -= 1;
  }
  return {
    state: { shards: shards, merged: merged, ledger: ledger, applied: applied },
    served: served,
    ledger_before: ledger.length,
    ledger: ledger.map(function (tuple) { return tuple.slice(); }),
    judged: judged,
    judged_bound: judgedBound
  };
}

export function step(spec) {
  const raw = spec && spec.budget;
  const budget = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  return run(spec, budget);
}

export function close(spec) {
  const result = run(Object.assign({}, spec, { events: [] }), Infinity);
  return { state: result.state, catchup: result.served };
}
