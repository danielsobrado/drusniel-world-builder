import * as THREE from 'three/webgpu';
import { hash, instanceIndex, mix, smoothstep, texture, uniform, uv, varying, vec3 } from 'three/tsl';

import { townKitShared } from './TownKitMaterial.js';

/**
 * Leaded window glass: translucent and shadowless (so sun shafts fall into
 * rooms), with a warm glow that grows as the sun goes down. By day every pane
 * glows faintly; towards night roughly two windows in three are lit, picked by
 * a hash of the window module's instance, so a street is never lit like a
 * lantern display.
 */
const DAY_GLOW = 0.18;
const NIGHT_GLOW = 1.4;
const LIT = vec3(1, 0.72, 0.42);


export function createTownGlassMaterial(source) {
  const glass = new THREE.MeshStandardNodeMaterial({
    name: 'TownGlass',
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const map = source?.map ?? null;
  // 0 in full day, 1 once the sun is a few degrees under the horizon.
  const dusk = smoothstep(0.35, -0.05, townKitShared.sunElevation);
  const lit = smoothstep(0.32, 0.36, varying(hash(instanceIndex)));
  const strength = mix(uniform(DAY_GLOW), mix(uniform(DAY_GLOW * 0.5), uniform(NIGHT_GLOW), lit), dusk);
  const pane = map ? texture(map, uv()).rgb : vec3(1);
  if (map) glass.colorNode = pane;
  glass.emissiveNode = pane.mul(LIT).mul(strength);
  glass.opacityNode = mix(uniform(0.3), uniform(0.75), dusk.mul(lit));
  glass.userData.townGlass = true;
  return glass;
}
