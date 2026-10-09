/** Spatial envelopes are XZ; a balcony's render envelope is XYZ. */
export function shapeFeatureBounds(plan, features) {
  const bounds = features.flatMap((feature) => {
    if (feature.child) return [feature.child.bounds];
    if (feature.solidSupport) return [feature.solidSupport.bounds];
    if (!feature.balcony) return [];
    const b = feature.balcony.bounds;
    return [{ min: [b.min[0], b.min[2]], max: [b.max[0], b.max[2]] }];
  });
  if (!bounds.length) return plan.bounds;
  return { min: plan.bounds.min.map((v, k) => Math.min(v, ...bounds.map((b) => b.min[k]))),
    max: plan.bounds.max.map((v, k) => Math.max(v, ...bounds.map((b) => b.max[k]))) };
}
