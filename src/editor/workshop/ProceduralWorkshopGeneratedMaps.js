import * as THREE from 'three/webgpu';
import { getSurfaceTextures } from '../assets/proceduralSurfaces.js';
import { HOUSE_SURFACE_ALIASES } from '../assets/godsEnd/houseSurfaces.js';

const catalogKinds = new Map(Object.entries(HOUSE_SURFACE_ALIASES).map(([kind, surface]) => [surface, kind]));

/** Apply the same generated maps in live parts and hover previews. */
export function applyWorkshopGeneratedMaps(material, preset) {
  if (!preset.proceduralSurface) return;
  const kind = catalogKinds.get(preset.proceduralSurface);
  if (!kind) throw new Error(`Unknown Gods End surface: ${preset.proceduralSurface}.`);
  const source = getSurfaceTextures(kind);
  const owned = [];
  for (const slot of ['map', 'normalMap']) {
    const map = source[slot].clone();
    map.center.set(0.5, 0.5);
    map.repeat.setScalar(preset.repeat);
    map.rotation = THREE.MathUtils.degToRad(preset.rotation);
    // Material owns these clones; per-part teardown skips them.
    map.userData = { ...map.userData, sharedSurface: true };
    map.needsUpdate = true;
    material[slot] = map;
    owned.push(map);
  }
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.bumpMap = null;
  material.emissive?.set(0);
  material.emissiveIntensity = 0;
  const dispose = () => {
    owned.forEach((map) => map.dispose());
    material.removeEventListener('dispose', dispose);
  };
  material.addEventListener('dispose', dispose);
}
