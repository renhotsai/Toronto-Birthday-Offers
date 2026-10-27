// For queries that always yield a row (`insert … returning`, `count()`); fails loudly instead of returning undefined.
export function one<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error("Expected a row, got none");
  return row;
}
