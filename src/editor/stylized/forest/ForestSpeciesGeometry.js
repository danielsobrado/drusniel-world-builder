import * as THREE from 'three';
import {
  finalizeGeometry,
  mergeParts,
  spherifyNormals,
  unitRandom,
} from './proceduralGeometry.js';

/**
 * Procedural tree prototypes for the species the source GLB does not cover.
 *
 * `grass-scene.glb` supplies only dark conifers, so `conifer_narrow` and
 * `conifer_wide` keep using those baked prototypes. The broadleaf archetypes —
 * round crowns, white-barked birch, flat tropical crowns and sparse wetland
 * stands — are built here.
 *
 * Built once at startup and cached, never during a chunk build. Age variation is
 * applied per instance by `ForestSpeciesRegistry` (`heightScale`, `trunkScale`,
 * `crownScale`), so geometry is generated per species, not per age — otherwise
 * every extra prototype would cost another pair of full-capacity InstancedMeshes.
 *
 * Output matches the `extractPrototypeParts` contract: parts tagged 'trunk' or
 * 'leaf', pivoted on the trunk base at y=0 and centred on XZ. Geometry is
 * de-indexed so merges succeed across primitive types and so crowns read as
 * hard-edged facets rather than smooth blobs.
 */

const CROWN_SEGMENTS = 0;
// Short of 1 on purpose: fully spherical normals lose the faceting that keeps
// these crowns from looking like smooth balloons, so a little face normal stays.
const CROWN_NORMAL_SPHERIFY = 0.85;
const TRUNK_RING_FRACTIONS = Object.freeze([0, 0.08, 0.22, 0.48, 0.76, 1.0]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildTrunkProfile({
  speciesId,
  height,
  baseRadius,
  topRadius,
  flareScale,
  leanX,
  leanZ,
  forkHeights,
}) {
  const rootCount = baseRadius > 0.28 ? 4 : 3;
  const rootStart = unitRandom(speciesId, 41) * Math.PI * 2;
  const rootAngles = [];
  let cursor = rootStart;
  for (let i = 0; i < rootCount; i += 1) {
    // Uneven intervals give paired buttresses and wider sinuses instead of a regular star.
    const step = ((0.65 + unitRandom(speciesId, 42 + i) * 0.7) / rootCount) * Math.PI * 2;
    rootAngles.push(cursor);
    cursor += step;
  }
  const rootWeights = rootAngles.map((_, i) => 0.55 + unitRandom(speciesId, 52 + i) * 0.55);
  const phase2 = unitRandom(speciesId, 61) * Math.PI * 2;
  const phase3 = unitRandom(speciesId, 62) * Math.PI * 2;
  const sweepDirX = Math.cos(phase2);
  const sweepDirZ = Math.sin(phase2);
  const orthoX = -sweepDirZ;
  const orthoZ = sweepDirX;
  const sweepAmp = height * (0.022 + unitRandom(speciesId, 63) * 0.016);
  const kinkAmp = height * (0.012 + unitRandom(speciesId, 64) * 0.012);
  const sortedForks = [...forkHeights].sort((a, b) => a - b);

  function centerAt(u) {
    const t = clamp(u, 0, 1);
    const sCurve = Math.sin(t * Math.PI * 1.15) * sweepAmp;
    const kink = Math.sin(Math.max(0, t - 0.18) * Math.PI * 1.75) * kinkAmp;
    return {
      x: leanX * t + sweepDirX * sCurve + orthoX * kink,
      z: leanZ * t + sweepDirZ * sCurve + orthoZ * kink,
    };
  }

  function radiusAt(u, theta = null) {
    const t = clamp(u, 0, 1);
    const baseTaper = baseRadius + (topRadius - baseRadius) * (t ** 0.84);
    let forkStep = 0;
    for (const fy of sortedForks) {
      const f = clamp(fy / Math.max(height, 1e-4), 0.15, 0.95);
      if (t > f) {
        const passed = clamp((t - f) / 0.12, 0, 1);
        forkStep += 0.045 * passed;
      }
    }
    const stemRadius = baseTaper * (1 - Math.min(0.18, forkStep));
    const flareBand = Math.max(0, 1 - t / 0.24) ** 1.85;
    if (theta === null) {
      return stemRadius * (1 + (flareScale - 1) * 0.45 * flareBand);
    }
    let rootLobe = 0;
    for (let i = 0; i < rootAngles.length; i += 1) {
      const align = Math.max(0, Math.cos(theta - rootAngles[i]));
      rootLobe = Math.max(rootLobe, (align ** 3) * rootWeights[i]);
    }
    const rootGain = (flareScale - 1) * flareBand * (0.16 + 0.92 * rootLobe);
    const asymmetry = (1 - 0.35 * t) * (
      0.065 * Math.cos(2 * theta + phase2 + 0.9 * t)
      + 0.045 * Math.cos(3 * theta + phase3 - 0.7 * t)
    );
    return stemRadius * (1 + rootGain + asymmetry);
  }

  return { centerAt, radiusAt };
}

function tubeFromRings(rings, radialSegments, uvUScale = 1, uvVTotal = 1) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let r = 0; r < rings.length; r += 1) {
    const ring = rings[r];
    const v = uvVTotal * (ring.arcDist ?? (r / Math.max(1, rings.length - 1)));
    for (let s = 0; s < radialSegments; s += 1) {
      const theta = (s / radialSegments) * Math.PI * 2;
      const point = ring.pointAt(theta);
      positions.push(point.x, point.y, point.z);
      uvs.push((s / radialSegments) * uvUScale, v);
    }
  }
  for (let r = 0; r + 1 < rings.length; r += 1) {
    const baseA = r * radialSegments;
    const baseB = (r + 1) * radialSegments;
    for (let s = 0; s < radialSegments; s += 1) {
      const next = (s + 1) % radialSegments;
      const a = baseA + s;
      const b = baseA + next;
      const c = baseB + s;
      const d = baseB + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function trunk({
  speciesId,
  height,
  profile,
  radialSegments = 6,
  ringFractions = TRUNK_RING_FRACTIONS,
}) {
  const twistOffset = unitRandom(speciesId, 71) * 0.4;
  const rings = ringFractions.map((u) => {
    const center = profile.centerAt(u);
    const y = u * height;
    const ringTwist = twistOffset * Math.sin(u * Math.PI);
    return {
      arcDist: y,
      pointAt: (theta) => {
        const radius = profile.radiusAt(u, theta + ringTwist);
        return {
          x: center.x + Math.cos(theta) * radius,
          y,
          z: center.z - Math.sin(theta) * radius,
        };
      },
    };
  });
  return tubeFromRings(rings, radialSegments, 1, 1);
}

/**
 * Curved, tapered multi-segment limb with an expanded branch collar anchored
 * inside the supporting trunk or parent bough and subtle directional change toward
 * the foliage lobe.
 */
function limb({
  fromX = 0,
  fromY,
  fromZ = 0,
  toX,
  toY,
  toZ,
  baseRadius,
  tipRadius = baseRadius * 0.42,
  collarScale = 1.24,
  archHeight = 0.14,
  lateralTwist = 0,
  radialSegments = 4,
  segments = 2,
}) {
  const start = new THREE.Vector3(fromX, fromY, fromZ);
  const end = new THREE.Vector3(toX, toY, toZ);
  const chord = end.clone().sub(start);
  const length = Math.max(0.08, chord.length());
  const dir = chord.clone().normalize();
  const upRef = Math.abs(dir.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(dir, upRef).normalize();
  const binorm = new THREE.Vector3().crossVectors(side, dir).normalize();
  const control = start.clone()
    .lerp(end, 0.46)
    .addScaledVector(binorm, length * archHeight)
    .addScaledVector(side, length * lateralTwist);

  const ringCount = Math.max(2, segments + 1);
  const rings = [];
  for (let i = 0; i < ringCount; i += 1) {
    const t = i / (ringCount - 1);
    const inv = 1 - t;
    const pos = start.clone().multiplyScalar(inv * inv)
      .addScaledVector(control, 2 * inv * t)
      .addScaledVector(end, t * t);
    // Tangent along quadratic Bezier
    const tan = control.clone().sub(start).multiplyScalar(2 * inv)
      .addScaledVector(end.clone().sub(control), 2 * t)
      .normalize();
    const tRef = Math.abs(tan.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const uAxis = new THREE.Vector3().crossVectors(tan, tRef).normalize();
    const vAxis = new THREE.Vector3().crossVectors(uAxis, tan).normalize();
    // Collar swell over the basal 20%, followed by gradual taper to the tip.
    const collar = 1 + (collarScale - 1) * ((1 - t) ** 3);
    const taper = baseRadius * ((tipRadius / Math.max(baseRadius, 1e-4)) ** (t ** 0.9));
    const rHoriz = taper * (1 + (collar - 1) * 0.55);
    const rVert = taper * collar;
    const twistRot = lateralTwist * 0.7 * t;
    rings.push({
      arcDist: t,
      pointAt: (theta) => {
        const ang = theta + twistRot;
        const localU = Math.cos(ang) * rHoriz;
        const localV = Math.sin(ang) * rVert;
        return {
          x: pos.x + uAxis.x * localU + vAxis.x * localV,
          y: pos.y + uAxis.y * localU + vAxis.y * localV,
          z: pos.z + uAxis.z * localU + vAxis.z * localV,
        };
      },
    });
  }
  return tubeFromRings(rings, radialSegments, 1, length);
}

/**
 * A crown lobe, returned with the ellipsoid that produced it. The leaf cards need
 * that ellipsoid to sit on the lobe's surface, and recovering it from a merged
 * bounding box afterwards would only give the union of every lobe.
 */
function crownLobe({ x, y, z, radiusX, radiusY, radiusZ, angle = 0, tier = 0 }) {
  const geometry = new THREE.DodecahedronGeometry(0.5, CROWN_SEGMENTS);
  geometry.scale(radiusX * 2, radiusY * 2, radiusZ * 2);
  geometry.translate(x, y, z);
  return {
    geometry, x, y, z, radiusX, radiusY, radiusZ, angle, tier,
  };
}

/**
 * A quad on a lobe's surface, facing outward, UV-mapped to the whole foliage card.
 *
 * These carry the silhouette: the alpha cut gives the ragged leafy edge that solid
 * lobes cannot, while the lobes behind them stop the canopy reading as see-through
 * — which is what would happen if the cut were applied to the lobes themselves,
 * since the card is only about a fifth opaque.
 */
function leafCard({ lobe, speciesId, channel, scale }) {
  const azimuth = unitRandom(speciesId, channel) * Math.PI * 2;
  // Uniform over the sphere rather than over latitude, so cards do not bunch at the poles.
  const cosPolar = unitRandom(speciesId, channel + 1) * 2 - 1;
  const sinPolar = Math.sqrt(Math.max(0, 1 - cosPolar * cosPolar));
  const unitX = sinPolar * Math.cos(azimuth);
  const unitY = cosPolar;
  const unitZ = sinPolar * Math.sin(azimuth);

  // `scale` is the card's half-extent as a fraction of the lobe radius. It has to
  // stay well under 1: the card is centred on the surface, so a half-extent near
  // the lobe radius doubles the crown's bounding box, and those bounds drive the
  // LOD pixel sizes and impostor radii.
  const size = Math.max(lobe.radiusX, lobe.radiusZ) * scale
    * (0.78 + unitRandom(speciesId, channel + 2) * 0.44);
  const geometry = new THREE.PlaneGeometry(size * 2, size * 2);
  geometry.rotateZ(unitRandom(speciesId, channel + 3) * Math.PI * 2);

  // Face the quad along the outward direction, then push it just past the surface
  // so it breaks the lobe's silhouette instead of z-fighting inside it.
  const normal = new THREE.Vector3(unitX, unitY, unitZ).normalize();
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
  );
  geometry.translate(
    lobe.x + unitX * lobe.radiusX * 0.82,
    lobe.y + unitY * lobe.radiusY * 0.82,
    lobe.z + unitZ * lobe.radiusZ * 0.82,
  );
  return geometry;
}

function irregularTierAngles(speciesId, tier, count, baseChannel, jitter) {
  const weights = Array.from(
    { length: count },
    (_, i) => 0.65 + unitRandom(speciesId, baseChannel + i) * (0.45 + jitter * 0.45),
  );
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const start = (tier * 1.47 + unitRandom(speciesId, baseChannel + 99) * 1.1) % (Math.PI * 2);
  let acc = start;
  return weights.map((weight) => {
    const angle = acc;
    acc += (weight / totalWeight) * Math.PI * 2;
    return angle;
  });
}

/**
 * Crown as separated horizontal tiers rather than one ring of lobes. A single
 * ring reads as a shrub on a stick from player height; the reference art gets its
 * silhouette from two or three distinct mass layers with sky between them, which
 * is also what lets the bole stay visible through the canopy.
 *
 * `tierRise` is measured in crown radii, so a tier's gap scales with its lobes.
 * `tierGrowth` above 1 broadens upward — a beech or birch carries its widest mass
 * at the top; below 1 tapers to a spire.
 */
function tieredCrown({
  speciesId,
  tiers,
  lobesPerTier,
  spread,
  baseY,
  tierRise,
  tierGrowth,
  radius,
  flatten,
  jitter,
}) {
  const lobes = [];
  let channel = 11;
  let tierY = baseY;
  let tierRadius = radius;
  for (let tier = 0; tier < tiers; tier += 1) {
    const angles = irregularTierAngles(speciesId, tier, lobesPerTier, channel + 200, jitter);
    for (let index = 0; index < lobesPerTier; index += 1) {
      const angle = angles[index];
      const ringRadius = spread
        * (tierRadius / radius)
        * (0.64 + unitRandom(speciesId, channel + 1) * 0.46);
      const lobeRadius = tierRadius * (0.76 + unitRandom(speciesId, channel + 2) * 0.38);
      lobes.push(crownLobe({
        x: Math.cos(angle) * ringRadius,
        // Kept small deliberately: the old ±0.45r wander blurred tiers together.
        y: tierY + (unitRandom(speciesId, channel + 3) - 0.5) * tierRadius * 0.28,
        z: Math.sin(angle) * ringRadius,
        radiusX: lobeRadius,
        radiusY: lobeRadius * flatten,
        radiusZ: lobeRadius * (0.86 + unitRandom(speciesId, channel + 4) * 0.28),
        angle,
        tier,
      }));
      channel += 5;
    }
    tierY += tierRise * tierRadius;
    tierRadius *= tierGrowth;
  }
  // Caps the topmost tier, which `tierY` has already stepped past.
  const capRadius = (tierRadius / tierGrowth) * 0.9;
  const capAngle = unitRandom(speciesId, 490) * Math.PI * 2;
  const capOffset = capRadius * 0.08 * unitRandom(speciesId, 491);
  lobes.push(crownLobe({
    x: Math.cos(capAngle) * capOffset,
    y: tierY - tierRise * (tierRadius / tierGrowth) + capRadius * flatten * 0.75,
    z: Math.sin(capAngle) * capOffset,
    radiusX: capRadius,
    radiusY: capRadius * flatten,
    radiusZ: capRadius,
    angle: capAngle,
    tier: tiers,
  }));
  return lobes;
}

/**
 * `trunkHeight` runs past `crownBase` on purpose for the tiered species: the bole
 * has to be visible between the mass layers, which is most of what makes a birch
 * stand read as birch.
 */
const ARCHETYPES = Object.freeze({
  // Beech: broad, top-heavy crown over a short bole.
  broadleaf_round: Object.freeze({
    trunkHeight: 7.2,
    trunkBase: 0.34,
    trunkTop: 0.19,
    crownBase: 4.3,
    crownRadius: 1.55,
    crownSpread: 1.5,
    tiers: 2,
    lobesPerTier: 4,
    tierRise: 2.8,
    tierGrowth: 1.2,
    flatten: 0.8,
    jitter: 0.5,
    limbRadius: 0.12,
  }),
  // Birch: slender white bole rising through two separated crowns.
  broadleaf_tall: Object.freeze({
    trunkHeight: 9.6,
    trunkBase: 0.24,
    trunkTop: 0.1,
    crownBase: 5.7,
    crownRadius: 1.45,
    crownSpread: 0.95,
    tiers: 2,
    lobesPerTier: 3,
    tierRise: 2.8,
    tierGrowth: 1.36,
    flatten: 0.84,
    jitter: 0.5,
    limbRadius: 0.075,
  }),
  // Emergent tropical: bare to the canopy, then wide flat plates.
  tropical_tall: Object.freeze({
    trunkHeight: 9.4,
    trunkBase: 0.3,
    trunkTop: 0.18,
    crownBase: 8.0,
    crownRadius: 1.5,
    crownSpread: 2.2,
    tiers: 2,
    lobesPerTier: 4,
    tierRise: 2.2,
    tierGrowth: 1.2,
    flatten: 0.58,
    jitter: 0.6,
    limbRadius: 0.1,
  }),
  // Willow/alder: low, open, one broad layer with a light crest.
  wetland_sparse: Object.freeze({
    trunkHeight: 3.4,
    trunkBase: 0.4,
    trunkTop: 0.22,
    crownBase: 3.5,
    crownRadius: 1.85,
    crownSpread: 1.9,
    tiers: 1,
    lobesPerTier: 4,
    tierRise: 1.9,
    tierGrowth: 1,
    flatten: 0.74,
    jitter: 0.85,
    limbRadius: 0.13,
  }),
});

/** Species that reuse the baked GLB conifer prototypes instead of generated geometry. */
export const FOREST_GLB_CONIFER_SPECIES = Object.freeze([
  'conifer_narrow',
  'conifer_wide',
]);

export const FOREST_GENERATED_SPECIES = Object.freeze(Object.keys(ARCHETYPES));

function angularDistance(a, b) {
  const diff = Math.abs(a - b) % (Math.PI * 2);
  return diff > Math.PI ? Math.PI * 2 - diff : diff;
}

function closestPairOrder(tierLobes) {
  const sorted = [...tierLobes].sort((left, right) => left.angle - right.angle);
  if (sorted.length < 2) return sorted;
  let bestPairIndex = 0;
  let bestGap = Infinity;
  for (let i = 0; i < sorted.length; i += 1) {
    const next = (i + 1) % sorted.length;
    const gap = angularDistance(sorted[i].angle, sorted[next].angle);
    if (gap < bestGap) {
      bestGap = gap;
      bestPairIndex = i;
    }
  }
  const ordered = [];
  for (let offset = 0; offset < sorted.length; offset += 1) {
    ordered.push(sorted[(bestPairIndex + offset) % sorted.length]);
  }
  return ordered;
}

function lobeTargetPoint(fromX, fromY, fromZ, lobe, reach = 0.9) {
  return {
    x: fromX + (lobe.x - fromX) * reach,
    y: fromY + (lobe.y - fromY) * reach,
    z: fromZ + (lobe.z - fromZ) * reach,
  };
}

function buildCrownBranchSkeleton({ speciesId, archetype, lobes, trunkProfile }) {
  const parts = [];
  const forkHeights = [];
  const forkRadialSides = lobes.length <= 7 ? 4 : 3;
  const maxHeight = archetype.trunkHeight;
  let channel = 600;

  function addDirectLimb(lobe, attachY, radiusShare, segments, archOverride = null) {
    const u = clamp(attachY / maxHeight, 0.12, 0.98);
    const base = trunkProfile.centerAt(u);
    const trunkR = trunkProfile.radiusAt(u);
    const baseR = clamp(trunkR * radiusShare, archetype.limbRadius * 0.72, trunkR * 0.62);
    const tip = lobeTargetPoint(base.x, attachY, base.z, lobe, 0.9);
    const twist = (unitRandom(speciesId, channel) - 0.5) * 0.16;
    const arch = archOverride ?? (0.11 + unitRandom(speciesId, channel + 1) * 0.08);
    channel += 3;
    forkHeights.push(attachY);
    parts.push(limb({
      fromX: base.x,
      fromY: attachY,
      fromZ: base.z,
      toX: tip.x,
      toY: tip.y,
      toZ: tip.z,
      baseRadius: baseR,
      tipRadius: baseR * 0.36,
      collarScale: 1.24,
      archHeight: arch,
      lateralTwist: twist,
      radialSegments: 4,
      segments,
    }));
  }

  function addForkedPair(lobeA, lobeB, attachY, radiusShare, splitSecondaryOnly) {
    const u = clamp(attachY / maxHeight, 0.14, 0.96);
    const base = trunkProfile.centerAt(u);
    const trunkR = trunkProfile.radiusAt(u);
    const baseR = clamp(trunkR * radiusShare, archetype.limbRadius * 0.85, trunkR * 0.66);
    const twist = (unitRandom(speciesId, channel) - 0.5) * 0.14;
    const dominantFirst = unitRandom(speciesId, channel + 1) >= 0.5;
    const dominant = dominantFirst ? lobeA : lobeB;
    const subordinate = dominantFirst ? lobeB : lobeA;
    channel += 3;
    forkHeights.push(attachY);

    if (splitSecondaryOnly) {
      const domTip = lobeTargetPoint(base.x, attachY, base.z, dominant, 0.9);
      const branchArch = 0.12 + unitRandom(speciesId, channel) * 0.06;
      parts.push(limb({
        fromX: base.x,
        fromY: attachY,
        fromZ: base.z,
        toX: domTip.x,
        toY: domTip.y,
        toZ: domTip.z,
        baseRadius: baseR,
        tipRadius: baseR * 0.38,
        collarScale: 1.22,
        archHeight: branchArch,
        lateralTwist: twist,
        radialSegments: 4,
        segments: 1,
      }));
      const forkX = base.x + (domTip.x - base.x) * 0.44;
      const forkY = attachY + (domTip.y - attachY) * 0.46;
      const forkZ = base.z + (domTip.z - base.z) * 0.44;
      const forkR = baseR * 0.62;
      const subTip = lobeTargetPoint(forkX, forkY, forkZ, subordinate, 0.9);
      parts.push(limb({
        fromX: forkX,
        fromY: forkY,
        fromZ: forkZ,
        toX: subTip.x,
        toY: subTip.y,
        toZ: subTip.z,
        baseRadius: forkR,
        tipRadius: forkR * 0.34,
        collarScale: 1.18,
        archHeight: 0.1,
        lateralTwist: -twist * 0.8,
        radialSegments: forkRadialSides,
        segments: 1,
      }));
      channel += 1;
      return;
    }

    const midX = (lobeA.x + lobeB.x) * 0.5;
    const midY = (lobeA.y + lobeB.y) * 0.5;
    const midZ = (lobeA.z + lobeB.z) * 0.5;
    const forkPos = {
      x: base.x + (midX - base.x) * 0.54,
      y: attachY + (midY - attachY) * 0.48,
      z: base.z + (midZ - base.z) * 0.54,
    };
    const forkEndR = baseR * 0.66;
    parts.push(limb({
      fromX: base.x,
      fromY: attachY,
      fromZ: base.z,
      toX: forkPos.x,
      toY: forkPos.y,
      toZ: forkPos.z,
      baseRadius: baseR,
      tipRadius: forkEndR,
      collarScale: 1.26,
      archHeight: 0.13,
      lateralTwist: twist,
      radialSegments: 4,
      segments: 2,
    }));

    const domTarget = lobeTargetPoint(forkPos.x, forkPos.y, forkPos.z, dominant, 0.9);
    const subTarget = lobeTargetPoint(forkPos.x, forkPos.y, forkPos.z, subordinate, 0.9);
    parts.push(limb({
      fromX: forkPos.x,
      fromY: forkPos.y,
      fromZ: forkPos.z,
      toX: domTarget.x,
      toY: domTarget.y,
      toZ: domTarget.z,
      baseRadius: forkEndR * 0.84,
      tipRadius: forkEndR * 0.34,
      collarScale: 1.14,
      archHeight: 0.08,
      lateralTwist: twist * 0.6,
      radialSegments: forkRadialSides,
      segments: 1,
    }));
    parts.push(limb({
      fromX: forkPos.x,
      fromY: forkPos.y,
      fromZ: forkPos.z,
      toX: subTarget.x,
      toY: subTarget.y,
      toZ: subTarget.z,
      baseRadius: forkEndR * 0.64,
      tipRadius: forkEndR * 0.28,
      collarScale: 1.14,
      archHeight: 0.11,
      lateralTwist: -twist,
      radialSegments: forkRadialSides,
      segments: 1,
    }));
  }

  for (let tier = 0; tier < archetype.tiers; tier += 1) {
    const sliceStart = tier * archetype.lobesPerTier;
    const tierLobes = closestPairOrder(lobes.slice(sliceStart, sliceStart + archetype.lobesPerTier));
    const attachBase = (lobe, idx) => clamp(
      lobe.y - archetype.crownRadius * (0.72 + unitRandom(speciesId, 700 + tier * 10 + idx) * 0.44),
      maxHeight * 0.26,
      maxHeight * 0.95,
    );
    if (tier === 0) {
      if (tierLobes.length >= 4) {
        addForkedPair(
          tierLobes[0],
          tierLobes[1],
          (attachBase(tierLobes[0], 0) + attachBase(tierLobes[1], 1)) * 0.5,
          0.56,
          false,
        );
        for (let i = 2; i < tierLobes.length; i += 1) {
          addDirectLimb(tierLobes[i], attachBase(tierLobes[i], i), 0.48, 2);
        }
      } else {
        for (let i = 0; i < tierLobes.length; i += 1) {
          addDirectLimb(tierLobes[i], attachBase(tierLobes[i], i), 0.48, 2);
        }
      }
    } else if (tierLobes.length >= 4) {
      addForkedPair(
        tierLobes[0],
        tierLobes[1],
        (attachBase(tierLobes[0], 0) + attachBase(tierLobes[1], 1)) * 0.5,
        0.54,
        true,
      );
      addForkedPair(
        tierLobes[2],
        tierLobes[3],
        (attachBase(tierLobes[2], 2) + attachBase(tierLobes[3], 3)) * 0.5,
        0.5,
        true,
      );
    } else if (tierLobes.length >= 3) {
      addForkedPair(
        tierLobes[0],
        tierLobes[1],
        (attachBase(tierLobes[0], 0) + attachBase(tierLobes[1], 1)) * 0.5,
        0.52,
        true,
      );
      addDirectLimb(tierLobes[2], attachBase(tierLobes[2], 2), 0.46, 2);
    } else {
      for (let i = 0; i < tierLobes.length; i += 1) {
        addDirectLimb(tierLobes[i], attachBase(tierLobes[i], i), 0.46, 1);
      }
    }
  }

  if (lobes.length <= 7 && lobes.length > 0) {
    const capLobe = lobes[lobes.length - 1];
    addDirectLimb(capLobe, maxHeight * 0.92, 0.55, 1, 0.08);
  }

  return parts;
}

export function createSpeciesPrototypeGeometry(speciesId, { cardsPerLobe = 0, cardScale = 0.42 } = {}) {
  const archetype = ARCHETYPES[speciesId];
  if (!archetype) {
    throw new Error(`No procedural archetype is defined for species "${speciesId}".`);
  }
  const lobes = tieredCrown({
    speciesId,
    tiers: archetype.tiers,
    lobesPerTier: archetype.lobesPerTier,
    spread: archetype.crownSpread,
    baseY: archetype.crownBase,
    tierRise: archetype.tierRise,
    tierGrowth: archetype.tierGrowth,
    radius: archetype.crownRadius,
    flatten: archetype.flatten,
    jitter: archetype.jitter,
  });
  const leanAngle = unitRandom(speciesId, 2) * Math.PI * 2;
  const leanDist = (0.015 + unitRandom(speciesId, 3) * 0.022) * archetype.trunkHeight;
  const prelimForks = lobes.slice(0, archetype.tiers * archetype.lobesPerTier).map((lobe) => (
    clamp(lobe.y - archetype.crownRadius, archetype.trunkHeight * 0.25, archetype.trunkHeight * 0.95)
  ));
  const trunkProfile = buildTrunkProfile({
    speciesId,
    height: archetype.trunkHeight,
    baseRadius: archetype.trunkBase,
    topRadius: archetype.trunkTop,
    flareScale: Math.max(1.38, 0.52 / Math.max(archetype.trunkBase, 0.18)),
    leanX: Math.cos(leanAngle) * leanDist,
    leanZ: Math.sin(leanAngle) * leanDist,
    forkHeights: prelimForks,
  });
  const radialSegments = lobes.length <= 7 ? 7 : 6;
  const skeletonParts = buildCrownBranchSkeleton({ speciesId, archetype, lobes, trunkProfile });
  const trunkParts = [
    trunk({
      speciesId,
      height: archetype.trunkHeight,
      profile: trunkProfile,
      radialSegments,
    }),
    ...skeletonParts,
  ];

  const trunkGeometry = finalizeGeometry(mergeParts(trunkParts));
  // Spherified after the merge, not per lobe: the whole crown has to share one
  // gradient, or each tier lights as its own separate ball.
  const leafGeometry = spherifyNormals(
    finalizeGeometry(mergeParts(lobes.map((lobe) => lobe.geometry))),
    { strength: CROWN_NORMAL_SPHERIFY },
  );
  const cards = [];
  for (let index = 0; index < lobes.length; index += 1) {
    for (let card = 0; card < cardsPerLobe; card += 1) {
      cards.push(leafCard({
        lobe: lobes[index],
        speciesId,
        channel: 900 + index * 17 + card * 4,
        scale: cardScale,
      }));
    }
  }
  // Cards get the crown's spherified normals too, so a card and the lobe behind it
  // shade alike instead of the card reading as a flat sticker.
  const cardGeometry = cards.length > 0
    ? spherifyNormals(
      finalizeGeometry(mergeParts(cards)),
      { strength: CROWN_NORMAL_SPHERIFY, center: leafGeometry.boundingBox.getCenter(new THREE.Vector3()) },
    )
    : null;
  const bounds = trunkGeometry.boundingBox.clone().union(leafGeometry.boundingBox);
  if (cardGeometry) bounds.union(cardGeometry.boundingBox);
  return {
    speciesId,
    height: bounds.max.y - bounds.min.y,
    width: Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z),
    parts: [
      { geometry: trunkGeometry, kind: 'trunk' },
      { geometry: leafGeometry, kind: 'leaf' },
      // Its own part because it needs an alpha cut the solid lobes must not get.
      // `kind: 'leaf'` so it inherits the grove tint and the no-shadow rule.
      ...(cardGeometry ? [{ geometry: cardGeometry, kind: 'leaf', card: true }] : []),
    ],
  };
}

export function createForestSpeciesPrototypeGeometry(
  speciesIds = FOREST_GENERATED_SPECIES,
  options = {},
) {
  return speciesIds.map((speciesId) => createSpeciesPrototypeGeometry(speciesId, options));
}

/**
 * Palette overrides so each species reads distinctly through the shared leaf and
 * trunk materials. `broadleaf_tall` is the reference image's white-trunked birch.
 */
export const FOREST_SPECIES_PALETTES = Object.freeze({
  broadleaf_round: Object.freeze({
    leafBottom: '#3f7a2c',
    leafTop: '#8fc63f',
    variationColor: '#2f6a34',
    barkTint: '#7a6244',
    barkTintStrength: 0.55,
    barkBrightness: 1.2,
  }),
  broadleaf_tall: Object.freeze({
    leafBottom: '#4c8a33',
    leafTop: '#a8d152',
    variationColor: '#3b7440',
    barkTint: '#e8e6dd',
    barkTintStrength: 0.88,
    barkBrightness: 1.45,
  }),
  tropical_tall: Object.freeze({
    leafBottom: '#256b2c',
    leafTop: '#63b23a',
    variationColor: '#1f5c33',
    barkTint: '#6f5c42',
    barkTintStrength: 0.5,
    barkBrightness: 1.15,
  }),
  wetland_sparse: Object.freeze({
    leafBottom: '#42632c',
    leafTop: '#87a24a',
    variationColor: '#3a5c3a',
    barkTint: '#5d5541',
    barkTintStrength: 0.6,
    barkBrightness: 1.05,
  }),
});

/**
 * Species this file can generate geometry for, given the authored coverage a
 * scene actually loaded. Generated archetypes are a fallback, not pool members:
 * a lobe-and-cylinder tree standing beside an authored GLB reads as the cheap
 * one, and pooling them meant roughly one broadleaf in three was a blob. Build
 * them only where nothing authored claims the species.
 */
export function uncoveredGeneratedSpecies(coveredSpeciesIds) {
  const covered = coveredSpeciesIds instanceof Set
    ? coveredSpeciesIds
    : new Set(coveredSpeciesIds ?? []);
  return FOREST_GENERATED_SPECIES.filter((speciesId) => !covered.has(speciesId));
}

/**
 * Maps every species onto the prototype indices that can render it. Conifers use
 * the baked GLB range plus any authored conifer; authored broadleaf variants
 * claim their species outright. Generated archetypes only ever appear for a
 * species no variant covers, and species with no prototype at all fall back to
 * the whole GLB range so a misconfigured palette still renders something.
 *
 * `generatedFirstIndex` is where the generated prototypes begin. They are
 * appended after the authored variants — the loader cannot know which species
 * need generating until every variant has declared itself — so this is no longer
 * `glbPrototypeCount`.
 */
export function createSpeciesPrototypeIndex({
  glbPrototypeCount,
  generatedSpeciesIds,
  generatedFirstIndex = glbPrototypeCount,
  additionalPrototypeIndicesBySpecies = null,
  // Primary-scene prototypes kept out of every species pool (a misshapen source tree).
  excludedPrimaryIndices = [],
}) {
  const excluded = new Set(excludedPrimaryIndices);
  for (const index of excluded) {
    if (!Number.isInteger(index) || index < 0 || index >= glbPrototypeCount) {
      throw new Error(`Excluded primary tree prototype ${index} is outside 0..${glbPrototypeCount - 1}.`);
    }
  }
  const glbRange = Array.from({ length: glbPrototypeCount }, (_, index) => index)
    .filter((index) => !excluded.has(index));
  if (glbRange.length === 0) throw new Error('Every primary tree prototype is excluded.');
  const map = new Map();
  for (const speciesId of FOREST_GLB_CONIFER_SPECIES) {
    map.set(speciesId, glbRange);
  }
  for (const [speciesId, indices] of additionalPrototypeIndicesBySpecies ?? []) {
    const existing = map.get(speciesId) ?? [];
    map.set(speciesId, [...existing, ...indices]);
  }
  generatedSpeciesIds.forEach((speciesId, offset) => {
    if (map.has(speciesId)) {
      throw new Error(
        `Generated archetype for "${speciesId}" was built even though an authored `
        + 'variant covers it.',
      );
    }
    map.set(speciesId, [generatedFirstIndex + offset]);
  });
  return { map, fallback: glbRange };
}
