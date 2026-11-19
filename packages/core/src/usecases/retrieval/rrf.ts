/** The usual RRF constant (Cormack et al., 2009; ADR-0029). Larger values flatten the ranks. */
export const RRF_K = 60;

export interface FusedItem {
  id: string;
  /** Sum over lists of 1 / (k + rank), rank 1-based. Higher is better. */
  score: number;
  /** 1-based rank in each input list, or null where the item is absent. */
  ranks: (number | null)[];
}

/**
 * Reciprocal rank fusion. Each list is ids ordered best first. An id repeated inside one list
 * counts once, at its best rank; an id found by several lists adds up, so it is listed once.
 * Ties keep the order of first appearance (list 0 first), which keeps the result stable.
 */
export function reciprocalRankFusion(
  lists: readonly (readonly string[])[],
  k = RRF_K,
): FusedItem[] {
  const byId = new Map<string, FusedItem>();
  lists.forEach((list, li) => {
    let rank = 0;
    const seen = new Set<string>();
    for (const id of list) {
      if (seen.has(id)) continue;
      seen.add(id);
      rank++;
      let item = byId.get(id);
      if (!item) {
        item = { id, score: 0, ranks: lists.map(() => null) };
        byId.set(id, item);
      }
      item.ranks[li] = rank;
      item.score += 1 / (k + rank);
    }
  });
  // Map iteration is insertion order and Array#sort is stable, so ties stay in that order.
  return [...byId.values()].sort((a, b) => b.score - a.score);
}
