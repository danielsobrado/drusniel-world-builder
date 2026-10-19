/** Pure, bounded (at most 16 tiles) prediction of every companion-array write. */
export function meadowPageUpdatePlan(page, tiles) {
  const present = new Set(tiles), order = page.order.slice();
  for (let i = order.length - 1; i >= 0; i--) {
    if (present.has(order[i])) continue;
    const tail = order.at(-1), removed = page.slots.get(order[i]);
    if (i !== order.length - 1 && removed?.count === Math.min(tail.output.count, page.stride)) {
      order[i] = tail; order.pop();
    } else order.splice(i, 1);
  }
  const retained = new Set(order);
  for (const tile of tiles) if (!retained.has(tile)) order.push(tile);
  let start = 0, bytes = 0, repackBytes = 0;
  const writes = [];
  for (const tile of order) {
    const count = Math.min(tile.output.count, page.stride), slot = page.slots.get(tile);
    const source = tile.prepared ?? tile.buildId;
    const writeSource = !slot || slot.start !== start || slot.count !== count || slot.source !== source;
    const metadata = writeSource || slot.renderX !== tile.renderX || slot.renderZ !== tile.renderZ
      || slot.revealTime !== tile.revealTime || slot.revealRank !== tile.revealRank;
    if (writeSource) bytes += count * 10 * 4;
    if (metadata) bytes += count * 4 * 4;
    if (slot && slot.start !== start && slot.count === count && slot.source === source) repackBytes += count * 14 * 4;
    writes.push({ tile, start, count, source, writeSource, metadata });
    start += count;
  }
  return { present, order, writes, count: start, bytes, repackBytes };
}
