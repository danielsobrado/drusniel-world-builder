import * as THREE from 'three/webgpu';

/**
 * Merges one kit module's per-material primitives into a single geometry for
 * the shared town material (TownKitMaterial), so a module draws once instead of
 * once per material — towns are bound by draw calls, not triangles.
 *
 * Every vertex gets a `kitData` vec4:
 *   x  baked shade from the kit's COLOR_0 (occlusion, grime, per-piece tone)
 *   y  sway weight 0..1 for cloth that moves in the wind (0 elsewhere)
 *   z  material index into the atlas table
 *   w  unused
 * plus MikkTSpace-style tangents for the material's parallax relief.
 * Glass stays separate: it is transparent and drawn with its own material.
 */

export const KIT_DATA_ATTRIBUTE = 'kitData';

/** Modules whose cloth hangs free: banners and stall awnings sway, sacks and rugs do not. */
const SWAYING_MODULE = /Banner|Market_Stall/;
const CLOTH_MATERIAL = /^M_cloth_/;
/** A banner's gilt emblem is stitched to the cloth and moves with it. */
const EMBLEM_MATERIAL = 'M_gold';

function swayRange(module, primitives) {
  if (!SWAYING_MODULE.test(module)) return null;
  let top = -Infinity;
  let bottom = Infinity;
  for (const { geometry, materialName } of primitives) {
    if (!CLOTH_MATERIAL.test(materialName)) continue;
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const y = position.getY(i);
      top = Math.max(top, y);
      bottom = Math.min(bottom, y);
    }
  }
  return top > bottom ? { top, bottom } : null;
}

function swaysWith(materialName, banner) {
  return CLOTH_MATERIAL.test(materialName) || (banner && materialName === EMBLEM_MATERIAL);
}

/**
 * @param {string} module kit module name
 * @param {Array<{geometry: THREE.BufferGeometry, materialName: string}>} primitives
 * @param {(materialName: string) => number} materialIndex atlas table index
 * @param {(materialName: string) => boolean} isGlass
 * @returns {{ opaque: THREE.BufferGeometry|null, glass: Array<{geometry, materialName}> }}
 */
export function mergeKitModule(module, primitives, materialIndex, isGlass) {
  const glass = primitives.filter((p) => isGlass(p.materialName));
  const solid = primitives.filter((p) => !isGlass(p.materialName));
  if (!solid.length) return { opaque: null, glass };
  const sway = swayRange(module, solid);
  const banner = /Banner/.test(module);
  let vertexCount = 0;
  let indexCount = 0;
  for (const { geometry } of solid) {
    vertexCount += geometry.getAttribute('position').count;
    indexCount += geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const kitData = new Float32Array(vertexCount * 4);
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let v = 0;
  let k = 0;
  for (const { geometry, materialName } of solid) {
    const pos = geometry.getAttribute('position');
    const nor = geometry.getAttribute('normal');
    const tex = geometry.getAttribute('uv');
    const col = geometry.getAttribute('color');
    const id = materialIndex(materialName);
    const moves = sway && swaysWith(materialName, banner);
    for (let i = 0; i < pos.count; i += 1) {
      const o = v + i;
      position.set([pos.getX(i), pos.getY(i), pos.getZ(i)], o * 3);
      if (nor) normal.set([nor.getX(i), nor.getY(i), nor.getZ(i)], o * 3);
      if (tex) uv.set([tex.getX(i), tex.getY(i)], o * 2);
      const weight = moves
        ? Math.min(1, Math.max(0, (sway.top - pos.getY(i)) / (sway.top - sway.bottom)))
        : 0;
      kitData.set([col ? col.getX(i) : 1, weight, id, 0], o * 4);
    }
    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i += 1) index[k + i] = geometry.index.getX(i) + v;
      k += geometry.index.count;
    } else {
      for (let i = 0; i < pos.count; i += 1) index[k + i] = v + i;
      k += pos.count;
    }
    v += pos.count;
  }
  const opaque = new THREE.BufferGeometry();
  opaque.setAttribute('position', new THREE.BufferAttribute(position, 3));
  opaque.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  opaque.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  opaque.setAttribute(KIT_DATA_ATTRIBUTE, new THREE.BufferAttribute(kitData, 4));
  opaque.setIndex(new THREE.BufferAttribute(index, 1));
  opaque.computeTangents();
  opaque.computeBoundingBox();
  opaque.computeBoundingSphere();
  return { opaque, glass };
}
