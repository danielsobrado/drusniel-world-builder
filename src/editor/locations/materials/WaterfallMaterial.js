import * as THREE from 'three/webgpu';
import {
  clamp, color, float, max, mix, smoothstep, texture, time, uv, vec2, vec3,
} from 'three/tsl';
import { bakedLight, locationLight } from './LocationShading.js';

/**
 * Animated alpine waterfall ribbon material driven by a packed RGB tileable noise
 * texture (`R`: vertical streaks, `G`: turbulent foam, `B`: mist wisp).
 * Never samples `viewportDepthTexture`, keeping render cost single-pass.
 */
export function createWaterfallMaterial(name, {
  noiseMap,
  waterTint = '#3a6678',
  foamTint = '#eef6fc',
  speed = 1.65,
} = {}) {
  const uvCoord = uv();
  const across = uvCoord.x;
  const along = uvCoord.y;

  const fastSample = texture(noiseMap, vec2(across.mul(2.3), along.mul(0.18).sub(time.mul(speed))));
  const slowSample = texture(noiseMap, vec2(across.mul(1.35).add(0.37), along.mul(0.11).sub(time.mul(speed * 0.58))));

  const streaks = clamp(fastSample.r.mul(0.72).add(slowSample.r.mul(0.28)), 0, 1);
  const turb = clamp(fastSample.g.mul(0.6).add(slowSample.g.mul(0.4)), 0, 1);
  const wisp = slowSample.b;

  // Softly fray the lateral edges of the sheet so it merges organically into cliff rock.
  const edge = smoothstep(0.0, 0.16, across).mul(smoothstep(0.84, 1.0, across).oneMinus());
  const frayedEdge = smoothstep(0.08, 0.52, edge.add(wisp.sub(0.5).mul(0.28)));

  // Bright aerated whitewater crests along streaks and turbulence peaks.
  const foamMask = smoothstep(0.34, 0.78, streaks.mul(0.62).add(turb.mul(0.52)));
  const coreColor = mix(color(waterTint), color(foamTint), foamMask);

  // Combine baked sunlight/firelight with ambient sky fill so falls read brightly in alpine daylight or dusk.
  const ambient = mix(locationLight.ambientDown, locationLight.ambientUp, float(0.75));
  const lighting = max(bakedLight.mul(0.85).add(ambient.mul(0.95)), vec3(0.28, 0.34, 0.40));
  const shaded = coreColor.mul(lighting).add(color(foamTint).mul(foamMask.mul(0.16)));

  const material = new THREE.MeshBasicNodeMaterial({
    name,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  material.colorNode = shaded;
  material.opacityNode = clamp(frayedEdge.mul(mix(float(0.68), float(0.96), foamMask)), 0, 0.96);
  return material;
}
