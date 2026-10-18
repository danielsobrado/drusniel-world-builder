/** On-demand readiness; compilation and reveal are part of publication. */
export function settlementPreparationStatus(view) {
  if (!view.enabled || view.disposed) return { ready: true, enabled: false };
  const pool = view.pool;
  let sites = 0, surfaces = 0, installation = 0, requestedBuildings = 0, requestedProps = 0;
  const errors = [];
  for (const site of view.sites.values()) {
    sites += Number(Boolean(site.job));
    surfaces += Number(!site.surfaces);
    installation += Number(!site.pavingReady);
    requestedBuildings += site.plan.buildings.length;
    requestedProps += site.plan.props?.length ?? 0;
    if (site.surfaceError) errors.push(String(site.surfaceError.message ?? site.surfaceError));
  }
  for (const entry of pool.entries.values()) if (entry.failed) errors.push(String(entry.failed.message ?? entry.failed));
  const variants = pool.pending;
  const compilation = pool.uncompiled.length + pool.compiling;
  const reveal = pool.unrevealed.length;
  return { ready: sites + surfaces + installation + variants + compilation + reveal === 0
    && errors.length === 0 && (view.sites.size === 0 || (!view.dirty && !view.fading)),
  enabled: true, sites, surfaces, installation, variants, compilation, reveal,
  requestedBuildings, requestedProps, residentSites: view.sites.size, errors: errors.slice(0, 16) };
}
