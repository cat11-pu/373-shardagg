// agg.js：分片写入（按名字升序）与合并
export function putOf(shards, shard, row) {
  const next = (shards || []).map(function (item) {
    return [item[0], item[1].slice()];
  });
  const entry = [shard, row.slice()];
  let index = next.length;
  for (let i = 0; i < next.length; i++) {
    if (next[i][0] === shard) {
      next[i] = entry;
      return next;
    }
    if (shard < next[i][0]) {
      index = i;
      break;
    }
  }
  next.splice(index, 0, entry);
  return next;
}

export function mergeOf(shards) {
  if (!shards || shards.length === 0) return [];
  let sum = 0;
  let count = 0;
  let low = Infinity;
  let high = -Infinity;
  for (const item of shards) {
    const row = item[1];
    sum += row[0];
    count += row[1];
    if (row[2] < low) low = row[2];
    if (row[3] > high) high = row[3];
  }
  return [sum, count, low, high];
}
