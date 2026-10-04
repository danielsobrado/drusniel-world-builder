/** Plans need new inputs or another fade step; draw culling still runs every frame. */
export function cachedLodPlan(view, key, timestamp, intervalMs, create) {
  const cached = view.cachedLodPlan;
  if (cached?.key === key && timestamp - cached.timestamp < intervalMs) return cached.plan;
  const plan = create();
  view.cachedLodPlan = { key, timestamp, plan };
  return plan;
}
