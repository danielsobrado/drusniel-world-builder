import * as THREE from 'three/webgpu';
import {
  attribute, clamp, color, float, mix, positionLocal, positionWorld, sin, smoothstep, time, vec3,
} from 'three/tsl';
import { COLD_ALPINE_BIOME_FLORA } from '../../stylized/flora/biomeFloraColdAlpine.js';
import { boulder, facetedCrystal } from '../gen/iceKit.js';
import { SHADE_SIZE } from '../gen/LightBake.js';
import { createRng } from '../gen/noise.js';
import {
  bakedShade, createLocationMaterial, geometryNormal, shadeSurface,
} from '../materials/LocationShading.js';

/**
 * Reinvests the grass-free high-mountain GPU budget into deterministic
 * GPU-instanced alpine forefield understories across open Frostgard sites:
 *   1. Frost-shattered scree & moraine cobbles (grounding cliffs, moraines, boulder skirts)
 *   2. Calved translucent ice shards & brash ice along meltwater channels & glacier toe
 *   3. Hardy cold-alpine tundra flora (frosted cotton-grass/sedge tufts & reindeer lichen
 *      cushions tucked into sheltered moraine pockets & rocky margins, with GPU wind sway)
 *
 * Strictly avoids walkable trails (`mask2.w > 0.08`) and emits zero runtime GPU readbacks.
 */

const UP = new THREE.Vector3(0, 1, 0);
const TEMP_POS = new THREE.Vector3();
const TEMP_NORM = new THREE.Vector3();
const TEMP_QUAT = new THREE.Quaternion();
const TEMP_ROLL = new THREE.Quaternion();
const TEMP_SCALE = new THREE.Vector3();
const TEMP_MAT = new THREE.Matrix4();

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
    shade[i * SHADE_SIZE + 3] = r.seam;
  }
  geometry.setAttribute('bakeLight', new THREE.InstancedBufferAttribute(light, 3));
  geometry.setAttribute('bakeDir', new THREE.InstancedBufferAttribute(dir, 3));
  geometry.setAttribute('bakeShade', new THREE.InstancedBufferAttribute(shade, SHADE_SIZE));
}

function buildInstancedLayer(name, baseGeometry, material, records, { alignToNormal = true, renderOrder = 0 } = {}) {
  if (records.length === 0 || !material) return null;
  const geometry = baseGeometry.clone();
  attachInstanceAttributes(geometry, records);
  const mesh = new THREE.InstancedMesh(geometry, material, records.length);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = renderOrder;

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    TEMP_POS.set(r.px, r.py, r.pz);
    if (alignToNormal) {
      TEMP_NORM.set(r.nx, r.ny, r.nz).normalize();
      if (TEMP_NORM.y < -0.995) TEMP_QUAT.set(1, 0, 0, 0);
      else TEMP_QUAT.setFromUnitVectors(UP, TEMP_NORM);
    } else {
      TEMP_QUAT.identity();
    }
    TEMP_ROLL.setFromAxisAngle(UP, r.yaw);
    TEMP_QUAT.multiply(TEMP_ROLL);
    TEMP_SCALE.set(r.sx, r.sy, r.sz);
    TEMP_MAT.compose(TEMP_POS, TEMP_QUAT, TEMP_SCALE);
    mesh.setMatrixAt(i, TEMP_MAT);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * Location-lit, frost-dusted cold-alpine flora material with GPU vertex wind sway
 * pinned at `positionLocal.y <= 0.02` so hardy sedge tufts shiver in the glacier wind.
 */
function createAlpineFloraMaterial(name, { wind = [0.6, 0.8], swayAmp = 0.045, frostAmount = 0.42 } = {}) {
  const wLen = Math.hypot(wind[0] ?? 0.6, wind[1] ?? 0.8) || 1;
  const wx = (wind[0] ?? 0.6) / wLen;
  const wz = (wind[1] ?? 0.8) / wLen;

  const vertColor = attribute('color', 'vec3');
  const heightFrac = smoothstep(float(0.02), float(0.32), positionLocal.y);
  // Desaturate and frost-dust cold-alpine vegetation so it belongs harmoniously in a snowy glacier valley.
  const luma = vertColor.r.mul(0.299).add(vertColor.g.mul(0.587)).add(vertColor.b.mul(0.114));
  const winterTone = mix(vertColor, vec3(luma).mul(vec3(0.95, 0.96, 0.92)), float(0.45));
  const frostMask = clamp(heightFrac.mul(0.75).add(geometryNormal.y.mul(0.35)), 0, 1)
    .mul(bakedShade.z).mul(float(frostAmount));
  const albedo = mix(winterTone.mul(0.76), color('#e4eef6'), frostMask);

  const shaded = shadeSurface({
    albedo,
    normal: geometryNormal,
    roughness: float(0.88),
    f0: float(0.03),
    metalness: 0,
    wrap: float(0.38),
  });
  const material = createLocationMaterial(name, shaded);
  material.side = THREE.DoubleSide;

  if (swayAmp > 0) {
    const phase = positionWorld.x.mul(1.7).add(positionWorld.z.mul(1.3));
    const bend = sin(time.mul(3.1).add(phase))
      .add(sin(time.mul(5.7).sub(phase.mul(1.4))).mul(0.35))
      .mul(0.5).add(0.45)
      .mul(heightFrac.mul(heightFrac))
      .mul(float(swayAmp));
    material.positionNode = positionLocal.add(vec3(bend.mul(wx), bend.mul(-0.18), bend.mul(wz)));
  }
  return material;
}

function getColdAlpinePrototype(id) {
  const entry = COLD_ALPINE_BIOME_FLORA.find((item) => item.id === id);
  if (!entry) return null;
  const geom = entry.createGeometry();
  const flat = geom.index ? geom.toNonIndexed() : geom;
  if (geom !== flat) geom.dispose();
  return flat;
}

function makeRecord(c, { px, py, pz, sx, sy, sz, yaw, thickness = 0.25, seam = 0.88 }) {
  return {
    px, py, pz,
    nx: c.nx, ny: c.ny, nz: c.nz,
    lr: c.lr, lg: c.lg, lb: c.lb,
    dx: c.dx, dy: c.dy, dz: c.dz,
    ao: c.ao,
    sky: c.sky,
    thickness,
    seam,
    sx, sy, sz,
    yaw,
  };
}

/**
 * Builds GPU-instanced alpine understory meshes for open-air Frostgard sites.
 *
 * @returns {THREE.InstancedMesh[]}
 */
export function buildLocationAlpineUnderstory({
  surface,
  baked,
  mask,
  mask2,
  nav,
  isStoneTerrain = false,
  rockMaterial,
  crystalMaterial,
  wind = [0.6, 0.8],
  seed = 307,
  maxCobbles = 420,
  maxIceShards = 220,
  maxTundraSedge = 160,
  maxTundraLichen = 160,
}) {
  const { positions, normals } = surface;
  const count = positions.length / 3;
  if (count === 0) return [];

  const rng = createRng(seed * 7331 + 97);
  const cobblePool = [];
  const icePool = [];
  const floraPool = [];

  const step = Math.max(1, Math.floor(count / 18000));
  for (let v = Math.floor(rng() * step); v < count; v += step) {
    const v3 = v * 3;
    const v4 = v * 4;
    const nx = normals[v3], ny = normals[v3 + 1], nz = normals[v3 + 2];
    if (ny < 0.34) continue;

    const px = positions[v3], py = positions[v3 + 1], pz = positions[v3 + 2];
    const dressed = isStoneTerrain ? mask[v4 + 3] : 0;
    const rock = isStoneTerrain ? (1 - dressed) : mask[v4];
    const snowMask = isStoneTerrain ? 0 : mask[v4 + 1];
    const lake = !isStoneTerrain && mask2 ? mask2[v4 + 2] : 0;
    const onTrail = !isStoneTerrain && mask2 ? mask2[v4 + 3] : 0;
    if (onTrail > 0.06 || dressed > 0.25) continue;
    // On open stone mountain approaches, stay strictly clear of walkable road/bridge/plaza nav surfaces.
    if (isStoneTerrain && nav?.surfaceAt) {
      const floorY = nav.surfaceAt(px, pz, py + 1.6);
      if (floorY !== null && Math.abs(py - floorY) < 1.65) continue;
    }

    const ao = baked.shade[v * SHADE_SIZE];
    const sky = baked.shade[v * SHADE_SIZE + 2];
    if (sky < 0.25) continue;

    const lr = baked.light[v3], lg = baked.light[v3 + 1], lb = baked.light[v3 + 2];
    const c = {
      px, py, pz, nx, ny, nz, lr, lg, lb,
      dx: baked.dir[v3], dy: baked.dir[v3 + 1], dz: baked.dir[v3 + 2],
      ao, sky, rock, snowMask, lake,
    };

    const nearWallOrMoraine = isStoneTerrain
      ? (py > -10 && py < 36 && Math.abs(px) > 5.5)
      : (Math.abs(px) > 16 || pz > 8 || snowMask < -0.08);
    // 1. Frost-shattered scree & moraine cobbles along rocky margins, moraine crests, cliff aprons, and boulder skirts.
    if (rock > 0.36 && ny > 0.36 && (nearWallOrMoraine || rng() < 0.35)) {
      cobblePool.push(c);
    }
    // 2. Calved translucent ice shards & brash ice along frozen melt channels and glacier toe.
    if (!isStoneTerrain && (lake > 0.14 || (rock < 0.38 && py < 7.5)) && ny > 0.35) {
      icePool.push(c);
    }
    // 3. Hardy cold-alpine tundra flora in sheltered rocky/moraine lee pockets & forefield rises (never on pure ice or trails).
    if (rock > 0.42 && ny > 0.48 && lake < 0.12 && (isStoneTerrain ? (py > -4 && py < 28 && pz > -24) : (py > -0.6 && py < 9.0)) && (nearWallOrMoraine || snowMask < -0.06)) {
      floraPool.push(c);
    }
  }

  const pickClustered = (pool, cap, clusterSize, spread, checkClearance = false) => {
    if (pool.length === 0 || cap <= 0) return [];
    const chosen = [];
    const hubs = Math.max(10, Math.ceil(cap / clusterSize));
    for (let h = 0; h < hubs && chosen.length < cap; h += 1) {
      const anchor = pool[Math.floor(rng() * pool.length)];
      if (checkClearance && nav?.isBlocked?.(anchor.px, anchor.pz)) continue;
      chosen.push(anchor);
      const rSq = spread * spread;
      let added = 1;
      for (let tries = 0; tries < 28 && added < clusterSize && chosen.length < cap; tries += 1) {
        const cand = pool[Math.floor(rng() * pool.length)];
        const ddx = cand.px - anchor.px;
        const ddz = cand.pz - anchor.pz;
        if (ddx * ddx + ddz * ddz <= rSq) {
          chosen.push(cand);
          added += 1;
        }
      }
    }
    return chosen;
  };

  const meshes = [];

  // --- Layer 1: Frost-shattered scree & moraine cobbles (lean smooth detail=2 unit) ---
  if (rockMaterial && maxCobbles > 0) {
    const picked = pickClustered(cobblePool, maxCobbles, 5, 3.6);
    const records = picked.map((c) => {
      const s = 0.14 + Math.pow(rng(), 1.55) * 0.42;
      return makeRecord(c, {
        px: c.px,
        py: c.py - s * 0.28,
        pz: c.pz,
        sx: s * (0.85 + rng() * 0.45),
        sy: s * (0.52 + rng() * 0.36),
        sz: s * (0.8 + rng() * 0.45),
        yaw: rng() * Math.PI * 2,
        thickness: 0.4,
        seam: 0.82,
      });
    });
    const cobbleGeo = boulder({ x: 0, y: 0, z: 0 }, 1, 0.78, 0.92, { seed: seed + 11, blocky: 0.22, maxDetail: 2 });
    const mesh = buildInstancedLayer('location-alpine-scree-cobbles', cobbleGeo, rockMaterial, records);
    cobbleGeo.dispose();
    if (mesh) meshes.push(mesh);
  }

  // --- Layer 2: Calved translucent ice shards & brash ice ---
  if (crystalMaterial && maxIceShards > 0) {
    const picked = pickClustered(icePool, maxIceShards, 4, 3.2);
    const records = picked.map((c) => {
      const s = 0.2 + Math.pow(rng(), 1.45) * 0.46;
      return makeRecord(c, {
        px: c.px,
        py: c.py - s * 0.16,
        pz: c.pz,
        sx: s * (0.8 + rng() * 0.5),
        sy: s * (0.65 + rng() * 0.75),
        sz: s * (0.7 + rng() * 0.5),
        yaw: rng() * Math.PI * 2,
        thickness: 0.22,
        seam: 0.9,
      });
    });
    const shardGeo = facetedCrystal(
      { x: 0, y: -0.1, z: 0 },
      { x: 0.16, y: 0.95, z: -0.08 },
      0.34,
      { sides: 6, taper: 0.48, tipRatio: 0.36, twist: 0.1, seed: seed + 29, flare: 1.15 },
    );
    const mesh = buildInstancedLayer('location-alpine-ice-shards', shardGeo, crystalMaterial, records, { renderOrder: 1 });
    shardGeo.dispose();
    if (mesh) meshes.push(mesh);
  }

  // --- Layer 3a: Wind-bent frosted alpine sedge / cotton-grass tufts ---
  if (maxTundraSedge > 0) {
    const sedgeGeo = getColdAlpinePrototype('tundra_cotton_grass_tuft');
    if (sedgeGeo) {
      const picked = pickClustered(floraPool, maxTundraSedge, 3, 2.8);
      const records = picked.map((c) => {
        const s = 0.95 + rng() * 0.85;
        return makeRecord(c, {
          px: c.px,
          py: c.py - 0.04,
          pz: c.pz,
          sx: s * (0.9 + rng() * 0.25),
          sy: s * (0.85 + rng() * 0.4),
          sz: s * (0.9 + rng() * 0.25),
          yaw: rng() * Math.PI * 2,
          thickness: 0.12,
          seam: 0.9,
        });
      });
      const sedgeMat = createAlpineFloraMaterial('location-alpine-sedge', { wind, swayAmp: 0.055, frostAmount: 0.38 });
      const mesh = buildInstancedLayer('location-alpine-tundra-sedge', sedgeGeo, sedgeMat, records, { alignToNormal: false });
      sedgeGeo.dispose();
      if (mesh) meshes.push(mesh);
    }
  }

  // --- Layer 3b: Ground-hugging reindeer lichen & crowberry cushions ---
  if (maxTundraLichen > 0) {
    const lichenGeo = getColdAlpinePrototype('tundra_reindeer_lichen_clump');
    if (lichenGeo) {
      const picked = pickClustered(floraPool, maxTundraLichen, 4, 2.5);
      const records = picked.map((c) => {
        const s = 1.0 + rng() * 1.05;
        return makeRecord(c, {
          px: c.px,
          py: c.py - 0.03,
          pz: c.pz,
          sx: s * (0.85 + rng() * 0.4),
          sy: s * (0.75 + rng() * 0.35),
          sz: s * (0.85 + rng() * 0.4),
          yaw: rng() * Math.PI * 2,
          thickness: 0.14,
          seam: 0.86,
        });
      });
      const lichenMat = createAlpineFloraMaterial('location-alpine-lichen', { wind, swayAmp: 0, frostAmount: 0.32 });
      const mesh = buildInstancedLayer('location-alpine-tundra-lichen', lichenGeo, lichenMat, records, { alignToNormal: true });
      lichenGeo.dispose();
      if (mesh) meshes.push(mesh);
    }
  }

  return meshes;
}
