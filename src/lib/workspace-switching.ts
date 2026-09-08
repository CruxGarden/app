/** A frozen MRU traversal: recency changes only after the selection is committed. */
export function recentOrder(ids: string[], mru: string[]): string[] {
  const present = new Set(ids);
  return [...new Set([...mru.filter((id) => present.has(id)), ...ids])];
}
export function nextRecent(index: number, direction: 1 | -1, count: number): number {
  return count ? (index + direction + count) % count : -1;
}
