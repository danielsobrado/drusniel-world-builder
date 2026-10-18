/** Asset metadata selects motion. Unannotated leafy assets take a stiff sway. */
export const PLANT_MOTION_PROFILES = Object.freeze({
  'grass-tuft': Object.freeze({ give: .7, maximumAngle: 1.1, rigid: false }),
  'flexible-stem': Object.freeze({ give: .22, maximumAngle: .16, rigid: true }),
  broadleaf: Object.freeze({ give: .09, maximumAngle: .075, rigid: true }),
  'woody-shrub': Object.freeze({ give: .035, maximumAngle: .04, rigid: true }),
  'fern-frond': Object.freeze({ give: .14, maximumAngle: .1, rigid: true }),
  rigid: Object.freeze({ give: 0, maximumAngle: 0, rigid: true }),
});

export function resolvePlantMotion(profile = 'woody-shrub') {
  const result = PLANT_MOTION_PROFILES[profile];
  if (!result) throw new Error(`Unknown plant motion profile: ${profile}`);
  return { id: profile, ...result };
}

/** CPU reference for the rigid rotation used by the shader and QA fixture. */
export function rotatePlantVector([x, y, z], [dx, dz], angle) {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return [x, y, z];
  dx /= length; dz /= length;
  const c = Math.cos(angle), s = Math.sin(angle);
  const projection = dz * x - dx * z;
  return [x * c + dx * y * s + dz * projection * (1 - c),
    y * c + (-dx * x - dz * z) * s,
    z * c + dz * y * s - dx * projection * (1 - c)];
}
