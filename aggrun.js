// aggrun.js：按处理预算处理事件，用尽则载压账；收尾不限预算把账做完
import { putOf, mergeOf } from "./agg.js";

const isInt = function (value) {
  return typeof value === "number" && Number.isInteger(value);
};

const err = function (spec, slot, code, message) {
  const known = {
    event: spec.event_error_code,
    shard: spec.bad_shard_code,
    stats: spec.bad_stats_code,
    dup: spec.dup_shard_code,
    empty: spec.empty_code
  }[slot];
  const error = new Error(message);
  error.code = known || code;
  return error;
};

const fresh = function (state) {
  return {
    shards: (state.shards || []).map(function (row) { return [row[0], row[1].slice()]; }),
    merged: (state.merged || []).map(function (row) { return row.slice(); }),
    ledger: (state.ledger || []).map(function (row) { return row.slice(); }),
    applied: (state.applied || []).slice()
  };
};

const tupleOf = function (event) {
  if (event.kind === "merge") return ["merge"];
  return ["report", event.shard, event.sum, event.count, event.low, event.high];
};

const eventKey = function (event) {
  return "tuple:" + JSON.stringify(tupleOf(event));
};

const checkEvent = function (event, spec) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw err(spec, "event", "E_BAD_EVENT", "事件必须是对象");
  }
  if (event.kind === "merge") return;
  if (event.kind !== "report") {
    throw err(spec, "event", "E_BAD_EVENT", "事件类型只能是 report 或 merge");
  }
  if (typeof event.shard !== "string" || event.shard.length === 0) {
    throw err(spec, "shard", "E_BAD_SHARD", "分片名不能为空");
  }
  if (!isInt(event.sum) || !isInt(event.low) || !isInt(event.high)) {
    throw err(spec, "stats", "E_BAD_STATS", "和与最小值、最大值必须是整数");
  }
  if (!isInt(event.count) || event.count <= 0) {
    throw err(spec, "stats", "E_BAD_STATS", "个数必须是正整数");
  }
  if (event.low > event.high) {
    throw err(spec, "stats", "E_BAD_STATS", "最小值不能超过最大值");
  }
};

const applyEvent = function (event, state, spec) {
  if (event.kind === "merge") {
    if (state.shards.length === 0) {
      throw err(spec, "empty", "E_EMPTY", "一片都没有不能合并");
    }
    state.merged.push(mergeOf(state.shards));
    return;
  }
  if (state.shards.some(function (row) { return row[0] === event.shard; })) {
    throw err(spec, "dup", "E_DUP_SHARD", "同一分片只能上报一次");
  }
  state.shards = putOf(state.shards, event.shard, [event.sum, event.count, event.low, event.high]);
};

export function step(spec) {
  const state = fresh(spec.state || { shards: [], merged: [], ledger: [], applied: [] });
  const events = spec.events || [];
  const budget = isInt(spec.budget) && spec.budget >= 0 ? spec.budget : 0;
  let served = 0;
  let exhausted = false;
  for (const event of events) {
    if (state.applied.indexOf(eventKey(event)) !== -1) continue;
    if (exhausted || served >= budget) {
      exhausted = true;
      state.ledger.push(tupleOf(event));
      continue;
    }
    checkEvent(event, spec);
    applyEvent(event, state, spec);
    state.applied.push(eventKey(event));
    served += 1;
  }
  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (row) { return row.slice(); }),
    judged: events.length,
    judged_bound: events.length
  };
}

export function close(spec) {
  const state = fresh(spec.state || { shards: [], merged: [], ledger: [], applied: [] });
  let catchup = 0;
  while (state.ledger.length) {
    const tuple = state.ledger.shift();
    const event = tuple[0] === "merge"
      ? { kind: "merge" }
      : { kind: "report", shard: tuple[1], sum: tuple[2], count: tuple[3], low: tuple[4], high: tuple[5] };
    checkEvent(event, spec);
    applyEvent(event, state, spec);
    state.applied.push(eventKey(event));
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
