import * as THREE from 'three/webgpu';
import { color, hash, instanceIndex, mix, smoothstep, texture, uniform, uv, varying, vec3 } from 'three/tsl';

import { townKitShared } from './TownKitMaterial.js';

/**
 * Leaded window glass: translucent and shadowless (so sun shafts fall into
 * rooms), with a warm glow that grows as the sun goes down. By day every pane
 * glows faintly; towards night roughly two windows in three are lit, picked by
 * a hash of the window module's instance, so a street is never lit like a
 * lantern display.
 */
const DAY_GLOW = 0.08;
const NIGHT_GLOW = 1.15;
/** Firelight behind glass, shared with SettlementView's windows (SettlementDusk). */
const FIRELIGHT = color('#ff9a3d');
const LIT = vec3(1, 0.84, 0.6);


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
  const pane = map ? texture(map, uv()).rgb : vec3(1);
  // After dark the pane's own pale colour gives way to the light behind it.
  if (map) glass.colorNode = mix(pane, pane.mul(0.15), dusk);
  // By day the pale crown glass is faintly lit through; after dark a lit window
  // burns with the same firelight as SettlementView's (SettlementDusk), the
  // leading staying dark between the quarries.
  const leading = smoothstep(0.12, 0.3, pane.dot(vec3(0.3, 0.55, 0.15)));
  const day = pane.mul(LIT).mul(DAY_GLOW);
  const night = FIRELIGHT.mul(leading).mul(mix(uniform(DAY_GLOW * 0.5), uniform(NIGHT_GLOW), lit));
  glass.emissiveNode = mix(day, night, dusk);
  glass.opacityNode = mix(uniform(0.3), uniform(0.75), dusk.mul(lit));
  glass.userData.townGlass = true;
  return glass;
}
