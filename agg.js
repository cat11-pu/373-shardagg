// agg.js：分片写入与合并
export function putOf(shards, shard, row) {
  const next = shards.slice();
  let pos = 0;
  while (pos < next.length && next[pos][0] < shard) pos += 1;
  next.splice(pos, 0, [shard, row.slice()]);
  return next;
}

export function mergeOf(shards) {
  if (!shards.length) return [];
  let sum = 0;
  let count = 0;
  let low = Infinity;
  let high = -Infinity;
  for (const row of shards) {
    sum += row[1][0];
    count += row[1][1];
    if (row[1][2] < low) low = row[1][2];
    if (row[1][3] > high) high = row[1][3];
  }
  return [sum, count, low, high];
}
