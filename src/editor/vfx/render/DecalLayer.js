import * as THREE from 'three';
import { uniformArray } from 'three/tsl';
import { ease, smoothstep } from '../math/vfxRandom.js';
import { createDecalMaterial } from './DecalMaterial.js';

const GRID = 12;
const VERTICES_PER_SLOT = (GRID + 1) * (GRID + 1);
const INDICES_PER_SLOT = GRID * GRID * 6;
const GROUND_LIFT_M = 0.06;
const RENDER_ORDER = 4400;

/**
 * Pooled ground decals — scorch, frost, acid, runes — draped onto the
 * terrain heightfield when they spawn. One mesh, one draw call; a decal's
 * fade, cooling embers and tint live in uniform arrays indexed by slot.
 */
export function createDecalLayer({ scene, atlas, lighting, groundHeight, slots = 32 }) {
  const slotLookValues = Array.from({ length: slots }, () => new THREE.Vector4());
  const slotTintValues = Array.from({ length: slots }, () => new THREE.Vector4());
  const slotLook = uniformArray(slotLookValues, 'vec4');
  const slotTint = uniformArray(slotTintValues, 'vec4');

  const positions = new Float32Array(slots * VERTICES_PER_SLOT * 3);
  const decalUv = new Float32Array(slots * VERTICES_PER_SLOT * 4);
  const indices = new Uint32Array(slots * INDICES_PER_SLOT);
  for (let slot = 0; slot < slots; slot += 1) {
    const base = slot * VERTICES_PER_SLOT;
    for (let row = 0; row <= GRID; row += 1) {
      for (let column = 0; column <= GRID; column += 1) {
        const offset = (base + row * (GRID + 1) + column) * 4;
        decalUv[offset] = column / GRID;
        decalUv[offset + 1] = row / GRID;
        decalUv[offset + 2] = slot;
      }
    }
    let index = slot * INDICES_PER_SLOT;
    for (let row = 0; row < GRID; row += 1) {
      for (let column = 0; column < GRID; column += 1) {
        const a = base + row * (GRID + 1) + column;
        const b = a + 1;
        const c = a + GRID + 1;
        const d = c + 1;
        indices[index++] = a; indices[index++] = c; indices[index++] = b;
        indices[index++] = b; indices[index++] = c; indices[index++] = d;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('decalUv', new THREE.BufferAttribute(decalUv, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

  const material = createDecalMaterial({ atlas, lighting, slotLook, slotTint });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'vfx-decals';
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.userData.skipWarmup = true;
  scene.add(mesh);

  const decals = Array.from({ length: slots }, () => ({ active: false, age: 0, spec: null, x: 0, z: 0 }));
  let cursor = 0;

  const drape = (slot) => {
    const decal = decals[slot];
    const { radius, rotation } = decal.spec;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const base = slot * VERTICES_PER_SLOT;
    for (let row = 0; row <= GRID; row += 1) {
      for (let column = 0; column <= GRID; column += 1) {
        const lx = (column / GRID - 0.5) * 2 * radius;
        const lz = (row / GRID - 0.5) * 2 * radius;
        const x = decal.x + lx * cosR - lz * sinR;
        const z = decal.z + lx * sinR + lz * cosR;
        const offset = (base + row * (GRID + 1) + column) * 3;
        positions[offset] = x;
        positions[offset + 1] = groundHeight(x, z) + GROUND_LIFT_M;
        positions[offset + 2] = z;
      }
    }
    positionAttribute.addUpdateRange(base * 3, VERTICES_PER_SLOT * 3);
    positionAttribute.needsUpdate = true;
  };

  const collapse = (slot) => {
    const base = slot * VERTICES_PER_SLOT * 3;
    positions.fill(0, base, base + VERTICES_PER_SLOT * 3);
    for (let offset = base + 1; offset < base + VERTICES_PER_SLOT * 3; offset += 3) positions[offset] = -1e5;
    positionAttribute.addUpdateRange(base, VERTICES_PER_SLOT * 3);
    positionAttribute.needsUpdate = true;
  };

  for (let slot = 0; slot < slots; slot += 1) collapse(slot);

  /**
   * @param {object} spec
   * @param {number} spec.x
   * @param {number} spec.z
   * @param {number} spec.radius metres
   * @param {number} spec.tile atlas tile
   * @param {number} spec.ramp ramp for the glowing detail
   * @param {number[]} spec.tint albedo of the stain
   * @param {number} [spec.emissive] HDR glow of the detail at full heat
   * @param {number} [spec.heat] starting heat
   * @param {number} [spec.coolSeconds] heat falls to zero over this
   * @param {number} [spec.opacity]
   * @param {number} [spec.fadeIn]
   * @param {number} [spec.hold]
   * @param {number} [spec.fadeOut]
   * @param {number} [spec.rotation]
   */
  const spawn = (spec) => {
    const slot = cursor;
    cursor = (cursor + 1) % slots;
    const decal = decals[slot];
    decal.active = true;
    decal.age = 0;
    decal.x = spec.x;
    decal.z = spec.z;
    decal.spec = {
      emissive: 0, heat: 0, coolSeconds: 3, opacity: 1, fadeIn: 0.15, hold: 20, fadeOut: 8,
      rotation: Math.random() * Math.PI * 2, ...spec,
    };
    drape(slot);
    return slot;
  };

  const update = (dt) => {
    let anyActive = false;
    for (let slot = 0; slot < slots; slot += 1) {
      const decal = decals[slot];
      if (!decal.active) continue;
      decal.age += dt;
      const spec = decal.spec;
      const total = spec.fadeIn + spec.hold + spec.fadeOut;
      if (decal.age >= total) {
        decal.active = false;
        slotLookValues[slot].z = 0;
        collapse(slot);
        continue;
      }
      anyActive = true;
      const alpha = spec.opacity
        * ease('outQuad', decal.age / Math.max(1e-3, spec.fadeIn))
        * (1 - smoothstep(spec.fadeIn + spec.hold, total, decal.age));
      const heat = spec.heat * Math.max(0, 1 - decal.age / Math.max(1e-3, spec.coolSeconds)) ** 1.5;
      slotLookValues[slot].set(spec.tile, spec.ramp, alpha, heat);
      slotTintValues[slot].set(spec.tint[0], spec.tint[1], spec.tint[2], spec.emissive);
    }
    mesh.visible = anyActive;
  };

  const shiftOrigin = (shiftX, shiftZ) => {
    for (let slot = 0; slot < slots; slot += 1) {
      const decal = decals[slot];
      if (!decal.active) continue;
      decal.x -= shiftX;
      decal.z -= shiftZ;
      drape(slot);
    }
  };

  return {
    mesh,
    spawn,
    update,
    shiftOrigin,
    get activeCount() {
      return decals.filter((decal) => decal.active).length;
    },
    prepareForCompile() {
      const wasVisible = mesh.visible;
      mesh.visible = true;
      return () => { mesh.visible = wasVisible; };
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
