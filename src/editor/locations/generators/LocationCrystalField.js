import * as THREE from 'three/webgpu';
import { crystalClusterUnit, facetedCrystal } from '../gen/iceKit.js';
import { SHADE_SIZE } from '../gen/LightBake.js';
import { createRng } from '../gen/noise.js';

/**
 * Reinvests the unused high-mountain grass-blade GPU budget into deterministic
 * GPU-instanced geological ice-crystal colonies & hoarfrost skirts across
 * Frostgard glacial locations.
 *
 * Instead of uniform confetti across smooth ceilings, selects grounded colony
 * hubs along fractured ledges, pillar shoulders, floor margins, and crevasse
 * rims, then clusters bold faceted hexagonal crystal spires + tight skirts of
 * sparkling hoarfrost needles solidly rooted into the ice (`2` InstancedMesh
 * draw calls sharing `IceCrystalMaterial` with per-instance baked lighting).
 */

const UP = new THREE.Vector3(0, 1, 0);
const TEMP_POS = new THREE.Vector3();
const TEMP_NORM = new THREE.Vector3();
const TEMP_QUAT = new THREE.Quaternion();
const TEMP_ROLL = new THREE.Quaternion();
const TEMP_SCALE = new THREE.Vector3();
const TEMP_MAT = new THREE.Matrix4();

function buildHoarfrostNeedleUnit(seed = 23) {
  return facetedCrystal(
    { x: 0, y: -0.08, z: 0 },
    { x: 0.02, y: 0.56, z: -0.01 },
    0.055,
    { sides: 6, taper: 0.34, tipRatio: 0.42, twist: 0.04, seed, flare: 1.12 },
  );
}

function attachInstanceAttributes(geometry, records) {
  const n = records.length;
  const light = new Float32Array(n * 3);
  const dir = new Float32Array(n * 3);
  const shade = new Float32Array(n * SHADE_SIZE);
  for (let i = 0; i < n; i += 1) {
    const r = records[i];
    light[i * 3] = r.lr; light[i * 3 + 1] = r.lg; light[i * 3 + 2] = r.lb;
    dir[i * 3] = r.dx; dir[i * 3 + 1] = r.dy; dir[i * 3 + 2] = r.dz;
    shade[i * SHADE_SIZE] = r.ao;
    shade[i * SHADE_SIZE + 1] = r.thickness;
    shade[i * SHADE_SIZE + 2] = r.sky;
  }
  geometry.setAttribute('bakeLight', new THREE.InstancedBufferAttribute(light, 3));
  geometry.setAttribute('bakeDir', new THREE.InstancedBufferAttribute(dir, 3));
  geometry.setAttribute('bakeShade', new THREE.InstancedBufferAttribute(shade, SHADE_SIZE));
}

function createCrystalInstancedMesh(name, baseGeometry, material, records) {
  const geometry = baseGeometry.clone();
  attachInstanceAttributes(geometry, records);
  const mesh = new THREE.InstancedMesh(geometry, material, records.length);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    TEMP_POS.set(r.px, r.py, r.pz);
    TEMP_NORM.set(r.nx, r.ny, r.nz).normalize();
    if (TEMP_NORM.y < -0.995) {
      TEMP_QUAT.set(1, 0, 0, 0);
    } else {
      TEMP_QUAT.setFromUnitVectors(UP, TEMP_NORM);
    }
    TEMP_ROLL.setFromAxisAngle(UP, r.roll);
    TEMP_QUAT.multiply(TEMP_ROLL);
    TEMP_SCALE.set(r.sx, r.sy, r.sz);
    TEMP_MAT.compose(TEMP_POS, TEMP_QUAT, TEMP_SCALE);
    mesh.setMatrixAt(i, TEMP_MAT);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * Builds geological crystal colonies along bare ice ledges, pillar feet, and
 * fracture seams while strictly excluding bedrock, snowbanks, ceilings, and
 * walkable `LocationNav` lanes.
 */
export function buildLocationCrystalField({
  surface,
  baked,
  mask,
  nav,
  crystalMaterial,
  seed = 101,
  maxClusters = 650,
  maxNeedles = 900,
}) {
  if (!crystalMaterial || (maxClusters <= 0 && maxNeedles <= 0)) return [];

  const rng = createRng(seed * 9157 + 43);
  const { positions, normals } = surface;
  const count = positions.length / 3;
  if (count === 0) return [];

  // 1. Collect eligible bare-ice candidate vertices (grounded ledges, bases, fracture seams — never smooth overhangs/ceilings).
  const candidates = [];
  const step = Math.max(1, Math.floor(count / 14000));
  for (let v = Math.floor(rng() * step); v < count; v += step) {
    const v3 = v * 3;
    const v4 = v * 4;
    const rock = mask[v4];
    const snow = mask[v4 + 1];
    const frost = mask[v4 + 2];
    const fracture = mask[v4 + 3];
    if (rock > 0.20 || snow > 0.30) continue;

    const nx = normals[v3], ny = normals[v3 + 1], nz = normals[v3 + 2];
    // Crystals grow upward/outward from ledges, floor edges, and fractured wall ribs (skip upside-down ceilings).
    if (ny < -0.18) continue;

    const px = positions[v3], py = positions[v3 + 1], pz = positions[v3 + 2];
    const floorY = nav?.surfaceAt?.(px, pz, py + 0.9) ?? null;
    if (floorY !== null && py >= floorY - 0.35 && py <= floorY + 2.35) continue;

    const lr = baked.light[v3], lg = baked.light[v3 + 1], lb = baked.light[v3 + 2];
    const luma = lr * 0.25 + lg * 0.5 + lb * 0.25;
    if (luma < 0.04) continue;

    // Prefer fractured zones, angled shoulders, and frost rims.
    const ledgeScore = (ny > 0.15 && ny < 0.85 ? 0.45 : 0.15) + fracture * 0.65 + frost * 0.25;
    if (ledgeScore < 0.38) continue;

    candidates.push({
      px, py, pz, nx, ny, nz, lr, lg, lb,
      dx: baked.dir[v3], dy: baked.dir[v3 + 1], dz: baked.dir[v3 + 2],
      ao: baked.shade[v * SHADE_SIZE],
      sky: baked.shade[v * SHADE_SIZE + 2],
      fracture,
      ledgeScore,
    });
  }
  if (candidates.length === 0) return [];

  // 2. Pick well-spaced geological colony hubs (radius 2.2..3.6 m) so crystals form rich outcrops rather than speckles.
  const hubCount = Math.min(38, Math.max(12, Math.floor(maxClusters / 16)));
  const hubs = [];
  const minHubDistSq = 4.2 * 4.2;
  for (let attempt = 0; attempt < candidates.length * 2 && hubs.length < hubCount; attempt += 1) {
    const c = candidates[Math.floor(rng() * candidates.length)];
    if (c.ledgeScore < 0.48 && rng() > 0.35) continue;
    let tooClose = false;
    for (let h = 0; h < hubs.length; h += 1) {
      const ddx = c.px - hubs[h].x, ddy = c.py - hubs[h].y, ddz = c.pz - hubs[h].z;
      if (ddx * ddx + ddy * ddy + ddz * ddz < minHubDistSq) { tooClose = true; break; }
    }
    if (!tooClose) {
      hubs.push({ x: c.px, y: c.py, z: c.pz, radius: 1.9 + rng() * 1.6 });
    }
  }
  if (hubs.length === 0) return [];

  // 3. Populate each colony hub with tightly grouped hero crystal clusters + surrounding hoarfrost needle skirts.
  const clusters = [];
  const needles = [];
  const occupiedCluster = new Set();
  const occupiedNeedle = new Set();
  const cellKey = (x, y, z, inv) => `${Math.floor(x * inv)},${Math.floor(y * inv)},${Math.floor(z * inv)}`;

  for (let i = 0; i < candidates.length; i += 1) {
    if (clusters.length >= maxClusters && needles.length >= maxNeedles) break;
    const c = candidates[i];
    let bestFalloff = 0;
    for (let h = 0; h < hubs.length; h += 1) {
      const hub = hubs[h];
      const d = Math.hypot(c.px - hub.x, c.py - hub.y, c.pz - hub.z);
      if (d < hub.radius) {
        bestFalloff = Math.max(bestFalloff, 1 - d / hub.radius);
      }
    }
    if (bestFalloff <= 0) continue;

    // Core of colony: bold hero crystal clusters solidly sunk 0.14 m into the ice.
    if (clusters.length < maxClusters && bestFalloff > 0.25 && rng() < 0.45 + bestFalloff * 0.5) {
      const key = cellKey(c.px, c.py, c.pz, 1.55);
      if (!occupiedCluster.has(key)) {
        occupiedCluster.add(key);
        const s = (0.58 + bestFalloff * 0.85) * (0.75 + rng() * 0.55);
        // Lean slightly upward toward light while staying rooted in the surface normal.
        const nx = c.nx * 0.72 + (rng() - 0.5) * 0.22;
        const ny = c.ny * 0.72 + 0.34;
        const nz = c.nz * 0.72 + (rng() - 0.5) * 0.22;
        clusters.push({
          px: c.px - c.nx * 0.14,
          py: c.py - c.ny * 0.14,
          pz: c.pz - c.nz * 0.14,
          nx, ny, nz,
          roll: rng() * Math.PI * 2,
          sx: s * (0.85 + rng() * 0.3),
          sy: s * (0.85 + rng() * 0.6),
          sz: s * (0.85 + rng() * 0.3),
          lr: c.lr, lg: c.lg, lb: c.lb,
          dx: c.dx, dy: c.dy, dz: c.dz,
          ao: c.ao,
          thickness: 0.35 + s * 0.32,
          sky: c.sky,
        });
        continue;
      }
    }

    // Perimeter of colony: sparkling hoarfrost needle skirts fringing the crystal outcrop.
    if (needles.length < maxNeedles && rng() < 0.55 + bestFalloff * 0.4) {
      const key = cellKey(c.px, c.py, c.pz, 2.2);
      if (!occupiedNeedle.has(key)) {
        occupiedNeedle.add(key);
        const s = (0.52 + bestFalloff * 0.65) * (0.7 + rng() * 0.6);
        needles.push({
          px: c.px - c.nx * 0.08,
          py: c.py - c.ny * 0.08,
          pz: c.pz - c.nz * 0.08,
          nx: c.nx * 0.8 + (rng() - 0.5) * 0.36,
          ny: c.ny * 0.8 + 0.25,
          nz: c.nz * 0.8 + (rng() - 0.5) * 0.36,
          roll: rng() * Math.PI * 2,
          sx: s * (0.75 + rng() * 0.4),
          sy: s * (0.8 + rng() * 0.75),
          sz: s * (0.75 + rng() * 0.4),
          lr: c.lr, lg: c.lg, lb: c.lb,
          dx: c.dx, dy: c.dy, dz: c.dz,
          ao: c.ao,
          thickness: 0.18 + s * 0.16,
          sky: c.sky,
        });
      }
    }
  }

  const meshes = [];
  if (clusters.length > 0) {
    const unit = crystalClusterUnit({ prisms: 5, seed: seed + 13, height: 0.92, radius: 0.15 });
    meshes.push(createCrystalInstancedMesh('location-crystal-clusters', unit, crystalMaterial, clusters));
    unit.dispose();
  }
  if (needles.length > 0) {
    const unit = buildHoarfrostNeedleUnit(seed + 29);
    meshes.push(createCrystalInstancedMesh('location-hoarfrost-needles', unit, crystalMaterial, needles));
    unit.dispose();
  }
  return meshes;
}
