import * as THREE from 'three/webgpu';
import {
  bakeContactAndNeighbourAO,
  buildBasalSoilSkirtGeometry,
  buildSpatialSampleGrid,
  countGeometryTriangles,
  sculptPositionKeyedRelief,
  smoothstep,
  subdivideGeometryRedGreen,
} from '../../stylized/shared/meshDetailRefine.js';

const P = (x, y, z) => ({ x, y, z });

const SKIRT_DISPLACEMENT = Object.freeze({
  rock: 0.012,
  rock_debris: 0.014,
  loam: 0.012,
  masonry: 0.008,
  carved: 0.007,
  timber: 0.006,
  planks: 0.005,
  roof: 0.010,
  iceBlock: 0.010,
  clearIce: 0.008,
  bronze: 0.003,
  iron: 0.003,
  ore: 0.012,
  cloth: 0.006,
});

/** Returns a local `(lx, ly, lz)` -> world `{ x, y, z }` mapper rotated around Y by `yaw`. */
export function atFrame(origin, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (lx, ly, lz) => P(origin.x + lx * c + lz * s, origin.y + ly, origin.z - lx * s + lz * c);
}

function ensureUniformTint(geometry) {
  const pos = geometry.attributes?.position;
  if (!pos) return;
  if (!geometry.attributes.tint) {
    const arr = new Float32Array(pos.count * 3);
    arr.fill(1);
    geometry.setAttribute('tint', new THREE.BufferAttribute(arr, 3));
  }
}

function appendBasalSkirt(captured, origin, { skirtMat = 'rock', skirtTint = 0x6f6860, seed = 17 } = {}) {
  let minX = origin.x - 0.45, maxX = origin.x + 0.45;
  let minZ = origin.z - 0.45, maxZ = origin.z + 0.45;
  for (const item of captured) {
    if (item.materialKey === 'glow') continue;
    const pos = item.geometry.attributes?.position;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y > origin.y + 0.65) continue;
      const x = pos.getX(i), z = pos.getZ(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const rx = Math.min(1.55, Math.max(0.42, (maxX - minX) * 0.48));
  const rz = Math.min(1.55, Math.max(0.42, (maxZ - minZ) * 0.48));
  const skirt = buildBasalSoilSkirtGeometry({
    origin: { x: (minX + maxX) * 0.5, y: origin.y, z: (minZ + maxZ) * 0.5 },
    radiusX: rx,
    radiusZ: rz,
    height: 0.11,
    sides: 14,
    rings: 4,
    seed,
    colorHex: skirtTint,
    indexed: false,
    withUv: true,
  });
  skirt.deleteAttribute('color');
  ensureUniformTint(skirt);
  captured.push({ materialKey: skirtMat, geometry: skirt, tint: skirtTint, gain: 1 });
}

/**
 * Wraps an underground/glacial prop builder to add a 3D basal soil/rubble/ice contact
 * skirt, conformally subdivide geometry to `>= 15,200` tris (`< 30,000`), apply
 * position-keyed micro-relief, and bake multi-part soil-contact + cavity + neighbour AO
 * into per-vertex `tint` while forwarding lights, flames, and nav blockers to `b`.
 */
export function emitDetailedUndergroundProp(b, origin, options, buildFn) {
  let opts = options;
  let fn = buildFn;
  if (typeof options === 'function') {
    fn = options;
    opts = {};
  }
  const {
    minTriangles = 15200,
    maxTriangles = 28000,
    skirtMat = 'rock',
    skirtTint = 0x6f6860,
    addSkirt = true,
  } = opts ?? {};

  const captured = [];
  const cap = {
    prop(materialKey, geometry, tint = 0xffffff, gain = 1) {
      if (!geometry) return;
      captured.push({ materialKey, geometry, tint, gain });
    },
    light(...args) {
      if (b.light) b.light(...args);
    },
    flame(...args) {
      if (b.flame) b.flame(...args);
    },
    nav: b.nav,
  };

  fn(cap);
  if (!captured.length) return;

  const seed = Math.abs(Math.round((origin.x * 73 + origin.y * 37 + origin.z * 113) * 10)) + 19;
  if (addSkirt) {
    appendBasalSkirt(captured, origin, { skirtMat, skirtTint, seed });
  }

  let totalTris = 0;
  let solidTris = 0;
  for (const item of captured) {
    const t = countGeometryTriangles(item.geometry);
    totalTris += t;
    if (item.materialKey !== 'glow') solidTris += t;
  }

  if (totalTris < minTriangles && solidTris > 0) {
    const needed = minTriangles - totalTris;
    for (let i = 0; i < captured.length; i += 1) {
      const item = captured[i];
      if (item.materialKey === 'glow') continue;
      const curTris = countGeometryTriangles(item.geometry);
      if (curTris <= 0) continue;
      const share = curTris / solidTris;
      const itemTarget = Math.max(curTris, curTris + Math.ceil(needed * share) + 24);
      const itemMax = Math.max(itemTarget + 2500, Math.ceil(maxTriangles * share));
      ensureUniformTint(item.geometry);
      item.geometry = subdivideGeometryRedGreen(item.geometry, itemTarget, { maxTris: itemMax });
    }
  } else {
    for (const item of captured) ensureUniformTint(item.geometry);
  }

  // Sculpt seam-free position-keyed micro-relief on non-glow solid parts.
  for (let i = 0; i < captured.length; i += 1) {
    const item = captured[i];
    const amp = SKIRT_DISPLACEMENT[item.materialKey] ?? 0;
    if (amp > 0) {
      sculptPositionKeyedRelief(item.geometry, {
        amplitude: amp,
        freq: 8.5,
        seed: seed + i * 7,
        groundY: origin.y,
        groundFade: true,
        weightFn: (_x, y) => smoothstep(0.0, 0.25, y - origin.y + 0.12),
      });
    }
  }

  // Multi-part spatial AO grid so separate timber/masonry/iron/ore sub-meshes shade each other.
  const solidGeos = captured.filter((c) => c.materialKey !== 'glow').map((c) => c.geometry);
  const sampleGrid = buildSpatialSampleGrid(solidGeos, 0.14);
  for (const item of captured) {
    if (item.materialKey === 'glow') continue;
    bakeContactAndNeighbourAO(item.geometry, {
      groundY: origin.y,
      origin,
      attrName: 'tint',
      sampleGrid,
      strength: 0.48,
      minAO: 0.34,
      blendBasalNormals: true,
    });
  }

  for (const item of captured) {
    b.prop(item.materialKey, item.geometry, item.tint, item.gain);
  }
}
