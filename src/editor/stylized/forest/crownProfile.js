import { cos, float, mix, positionGeometry, sin, vec3 } from 'three/tsl';

/**
 * Shared macro crown profiles for near TSL normals, profile-driven proxy geometry,
 * and baked impostor normals. Each LOD representation reads the same shape descriptor
 * so near, proxy, and impostor trees hold a unified species silhouette and lighting curve.
 */
export const DEFAULT_CROWN_PROFILES = Object.freeze({
  broadleaf: Object.freeze({
    shape: 'ellipsoid',
    aspect: Object.freeze([1.0, 0.88, 1.0]),
    upBias: 0.18,
    puffStrength: 0.16,
    lobes: Object.freeze([
      Object.freeze([-0.24, -0.06, 0.08, 0.64]),
      Object.freeze([0.23, -0.02, -0.10, 0.66]),
      Object.freeze([-0.05, 0.22, 0.12, 0.58]),
      Object.freeze([0.10, 0.16, 0.20, 0.52]),
      Object.freeze([-0.14, 0.06, -0.20, 0.54]),
    ]),
  }),
  columnar: Object.freeze({
    shape: 'ellipsoid',
    aspect: Object.freeze([0.68, 1.18, 0.68]),
    upBias: 0.14,
    puffStrength: 0.15,
    lobes: Object.freeze([
      Object.freeze([-0.12, -0.22, 0.06, 0.54]),
      Object.freeze([0.12, -0.05, -0.07, 0.56]),
      Object.freeze([-0.08, 0.14, 0.08, 0.50]),
      Object.freeze([0.06, 0.29, -0.04, 0.42]),
    ]),
  }),
  spreading: Object.freeze({
    shape: 'ellipsoid',
    aspect: Object.freeze([1.22, 0.68, 1.22]),
    upBias: 0.24,
    puffStrength: 0.14,
    lobes: Object.freeze([
      Object.freeze([-0.30, 0.04, 0.10, 0.56]),
      Object.freeze([0.30, 0.06, -0.08, 0.58]),
      Object.freeze([0.02, 0.16, 0.24, 0.54]),
      Object.freeze([-0.04, 0.14, -0.24, 0.52]),
      Object.freeze([0.0, 0.20, 0.0, 0.54]),
    ]),
  }),
  conifer: Object.freeze({
    shape: 'tiered-cone',
    aspect: Object.freeze([0.76, 1.15, 0.76]),
    upBias: 0.10,
    puffStrength: 0.11,
    tiers: Object.freeze([
      Object.freeze([-0.28, 0.96, 0.36]),
      Object.freeze([-0.08, 0.80, 0.34]),
      Object.freeze([0.11, 0.62, 0.32]),
      Object.freeze([0.27, 0.44, 0.28]),
      Object.freeze([0.39, 0.26, 0.22]),
    ]),
  }),
  sparse: Object.freeze({
    shape: 'ellipsoid',
    aspect: Object.freeze([0.95, 0.92, 0.95]),
    upBias: 0.16,
    puffStrength: 0.18,
    lobes: Object.freeze([
      Object.freeze([-0.24, 0.02, 0.06, 0.52]),
      Object.freeze([0.22, 0.14, -0.08, 0.48]),
      Object.freeze([-0.04, -0.14, -0.16, 0.46]),
      Object.freeze([0.06, 0.26, 0.12, 0.42]),
    ]),
  }),
});

function mergeProfile(base, override) {
  if (!override || typeof override !== 'object') return base;
  return {
    ...base,
    ...override,
    aspect: Array.isArray(override.aspect) && override.aspect.length === 3 ? override.aspect : base.aspect,
    lobes: Array.isArray(override.lobes) && override.lobes.length > 0 ? override.lobes : base.lobes,
    tiers: Array.isArray(override.tiers) && override.tiers.length > 0 ? override.tiers : base.tiers,
  };
}

/** Resolve all configured crown profiles, falling back to `DEFAULT_CROWN_PROFILES`. */
export function resolveCrownProfiles(trees = {}) {
  const input = trees?.crownProfiles ?? {};
  const resolved = {};
  for (const [key, fallback] of Object.entries(DEFAULT_CROWN_PROFILES)) {
    resolved[key] = mergeProfile(fallback, input[key]);
  }
  return resolved;
}

/** Resolve the canonical crown profile key for a species name or array of species names. */
export function resolveCrownProfileKey(species = 'broadleaf', explicitProfile = null) {
  if (typeof explicitProfile === 'string' && DEFAULT_CROWN_PROFILES[explicitProfile]) {
    return explicitProfile;
  }
  const primary = String(Array.isArray(species) ? species[0] : (species ?? 'broadleaf'));
  if (DEFAULT_CROWN_PROFILES[primary]) return primary;
  if (primary.startsWith('conifer')) return 'conifer';
  if (primary === 'broadleaf_tall') return 'columnar';
  if (primary === 'tropical_tall') return 'spreading';
  if (primary === 'wetland_sparse') return 'sparse';
  return 'broadleaf';
}

function normalizedRelBounds(bounds) {
  const center = vec3(...bounds.min.map((value, i) => (value + bounds.max[i]) * 0.5));
  const half = vec3(...bounds.min.map((value, i) => Math.max(0.05, (bounds.max[i] - value) * 0.5)));
  return positionGeometry.sub(center).div(half);
}

/**
 * GPU macro crown normal derived from the shared `crownProfile` descriptor.
 * Keeps lighting smooth across intersecting leaf clusters and distinguishes
 * layered conifer whorls from puffy broadleaf/spreading canopies.
 */
export function crownMacroNormalNode(
  bounds,
  profile = DEFAULT_CROWN_PROFILES.broadleaf,
  { puffStrength = null, upBias = null } = {},
) {
  const resolvedProfile = profile ?? DEFAULT_CROWN_PROFILES.broadleaf;
  const resolvedPuff = Number.isFinite(puffStrength) ? puffStrength : (resolvedProfile.puffStrength ?? 0.16);
  const resolvedUpBias = Number.isFinite(upBias) ? upBias : (resolvedProfile.upBias ?? 0.18);
  const rel = normalizedRelBounds(bounds);

  let macroDir;
  if (resolvedProfile.shape === 'tiered-cone') {
    const tierCount = resolvedProfile.tiers?.length ?? 5;
    const heightT = rel.y.mul(0.5).add(0.5).clamp(0, 1);
    const whorl = sin(heightT.mul(Math.PI * 2 * tierCount)).mul(0.14);
    const cone = vec3(rel.x, float(0.42 + resolvedUpBias).add(whorl), rel.z);
    macroDir = cone.div(cone.length().max(0.00001));
  } else {
    const base = rel.add(vec3(0, resolvedUpBias, 0));
    const ellipsoidDir = base.div(base.length().max(0.00001));
    const lobes = resolvedProfile.lobes ?? DEFAULT_CROWN_PROFILES.broadleaf.lobes;
    let lobeSum = vec3(0, 0, 0);
    let weightSum = float(0);
    for (const [ox, oy, oz, scale] of lobes) {
      const diff = rel.sub(vec3(ox * 2, oy * 2, oz * 2));
      const weight = float(scale).div(diff.dot(diff).add(0.22));
      const dir = diff.div(diff.length().max(0.001));
      lobeSum = lobeSum.add(dir.mul(weight));
      weightSum = weightSum.add(weight);
    }
    const lobeRaw = lobeSum.div(weightSum.max(0.001));
    const lobeDir = lobeRaw.div(lobeRaw.length().max(0.00001));
    const blended = mix(ellipsoidDir, lobeDir, 0.42);
    macroDir = blended.div(blended.length().max(0.00001));
  }

  if (!(resolvedPuff > 0)) return macroDir;

  const phase = rel.mul(2.1);
  const puff = vec3(
    sin(phase.x).mul(cos(phase.y.add(0.6))).mul(cos(phase.z.sub(0.4))),
    cos(phase.x.sub(0.5)).mul(sin(phase.y)).mul(cos(phase.z.add(0.3))).add(0.24),
    cos(phase.x.add(0.4)).mul(cos(phase.y.sub(0.5))).mul(sin(phase.z)),
  );
  const fine = rel.mul(4.3);
  const subPuff = vec3(
    cos(fine.x.add(1.1)).mul(sin(fine.y.sub(0.3))),
    sin(fine.x.sub(0.4)).mul(cos(fine.z.add(0.7))).add(0.15),
    sin(fine.y.add(0.8)).mul(cos(fine.z.sub(0.6))),
  ).mul(0.32);
  const combined = macroDir.add(puff.add(subPuff).mul(resolvedPuff));
  return combined.div(combined.length().max(0.00001));
}

function normalize3(x, y, z) {
  const len = Math.hypot(x, y, z);
  return len > 1e-6 ? [x / len, y / len, z / len] : [0, 1, 0];
}

/**
 * CPU mirror of `crownMacroNormalNode` for profile-driven proxy geometry so
 * proxy silhouettes shade identically to near 3D canopies and baked impostors.
 */
export function applyCrownProfileNormals(
  geometry,
  bounds,
  profile = DEFAULT_CROWN_PROFILES.broadleaf,
  { strength = 0.86 } = {},
) {
  const position = geometry?.getAttribute?.('position');
  if (!position) return geometry;
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal');
  const resolvedProfile = profile ?? DEFAULT_CROWN_PROFILES.broadleaf;
  const resolvedUpBias = resolvedProfile.upBias ?? 0.18;
  const cx = (bounds.min[0] + bounds.max[0]) * 0.5;
  const cy = (bounds.min[1] + bounds.max[1]) * 0.5;
  const cz = (bounds.min[2] + bounds.max[2]) * 0.5;
  const hx = Math.max(0.05, (bounds.max[0] - bounds.min[0]) * 0.5);
  const hy = Math.max(0.05, (bounds.max[1] - bounds.min[1]) * 0.5);
  const hz = Math.max(0.05, (bounds.max[2] - bounds.min[2]) * 0.5);
  const lobes = resolvedProfile.lobes ?? DEFAULT_CROWN_PROFILES.broadleaf.lobes;
  const tierCount = resolvedProfile.tiers?.length ?? 5;

  for (let i = 0; i < position.count; i += 1) {
    const rx = (position.getX(i) - cx) / hx;
    const ry = (position.getY(i) - cy) / hy;
    const rz = (position.getZ(i) - cz) / hz;

    let macro;
    if (resolvedProfile.shape === 'tiered-cone') {
      const heightT = Math.min(1, Math.max(0, ry * 0.5 + 0.5));
      const whorl = Math.sin(heightT * Math.PI * 2 * tierCount) * 0.14;
      macro = normalize3(rx, 0.42 + resolvedUpBias + whorl, rz);
    } else {
      const ellip = normalize3(rx, ry + resolvedUpBias, rz);
      let sx = 0;
      let sy = 0;
      let sz = 0;
      let sw = 0;
      for (const [ox, oy, oz, scale] of lobes) {
        const dx = rx - ox * 2;
        const dy = ry - oy * 2;
        const dz = rz - oz * 2;
        const weight = scale / (dx * dx + dy * dy + dz * dz + 0.22);
        const dir = normalize3(dx, dy, dz);
        sx += dir[0] * weight;
        sy += dir[1] * weight;
        sz += dir[2] * weight;
        sw += weight;
      }
      const invW = sw > 1e-4 ? 1 / sw : 1;
      const lobe = normalize3(sx * invW, sy * invW, sz * invW);
      macro = normalize3(
        ellip[0] * 0.58 + lobe[0] * 0.42,
        ellip[1] * 0.58 + lobe[1] * 0.42,
        ellip[2] * 0.58 + lobe[2] * 0.42,
      );
    }

    const blended = normalize3(
      normal.getX(i) * (1 - strength) + macro[0] * strength,
      normal.getY(i) * (1 - strength) + macro[1] * strength,
      normal.getZ(i) * (1 - strength) + macro[2] * strength,
    );
    normal.setXYZ(i, blended[0], blended[1], blended[2]);
  }
  normal.needsUpdate = true;
  return geometry;
}
