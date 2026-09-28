// agg.js：分片写入与合并（基线：一律原样返回）
export function putOf(shards, shard, row) {
  return shards;
}

export function mergeOf(shards) {
  return [];
}
