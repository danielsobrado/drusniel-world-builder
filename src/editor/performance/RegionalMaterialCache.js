/** Only unreferenced variants may release their Three pipeline lease. */
export function pruneRegionalMaterials(cache, idle, active, now, idleMs, limit = 1) {
  let retired = 0;
  for (const [key, material] of cache) {
    if (active.has(material)) { idle.delete(key); continue; }
    if (!idle.has(key)) idle.set(key, now);
    if (retired >= limit || now - idle.get(key) < idleMs) continue;
    cache.delete(key);
    idle.delete(key);
    material.dispose();
    retired++;
  }
  return retired;
}
