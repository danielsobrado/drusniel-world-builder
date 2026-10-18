const indices = new WeakMap();
function insert(rows, edge) {
  if (edge.status !== 'active') return;
  const from = edge.data.fromNodeId;
  let row = rows.get(from);
  if (!row) rows.set(from, row = []);
  let low = 0, high = row.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (row[mid].id.localeCompare(edge.id) < 0) low = mid + 1;
    else high = mid;
  }
  row.splice(low, 0, edge);
}
/** Map identity handles clone/load/rollback; its journal handles in-place edits. */
export function graphAdjacency(edges) {
  let index = indices.get(edges);
  const changes = index && edges.changesSince?.(index.revision);
  if (!index || changes == null) {
    index = { rows: new Map(), previous: new Map(), revision: edges.revision };
    for (const [id, edge] of edges) { insert(index.rows, edge); index.previous.set(id, edge); }
    if (typeof edges.changesSince === 'function') indices.set(edges, index);
    return index.rows;
  }
  for (const id of changes) {
    const previous = index.previous.get(id);
    if (previous?.status === 'active') {
      const row = index.rows.get(previous.data.fromNodeId);
      const position = row?.findIndex(edge => edge.id === id) ?? -1;
      if (position >= 0) row.splice(position, 1);
      if (row?.length === 0) index.rows.delete(previous.data.fromNodeId);
    }
    const edge = edges.get(id);
    if (edge) { insert(index.rows, edge); index.previous.set(id, edge); }
    else index.previous.delete(id);
  }
  index.revision = edges.revision;
  return index.rows;
}
