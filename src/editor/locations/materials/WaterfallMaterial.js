import * as THREE from 'three/webgpu';
import {
  attribute, clamp, color, dot, float, max, mix, normalize, positionLocal, pow, sin,
  smoothstep, texture, time, uv, vec2, vec3,
} from 'three/tsl';
import { bakedLight, geometryNormal, locationLight, viewDirection } from './LocationShading.js';

/**
 * Animated alpine waterfall material driven by a packed RGB tileable noise
 * texture (`R`: vertical flow streaks, `G`: turbulent foam, `B`: mist wisp).
 *
 * Includes 3D GPU vertex surface turbulence, deep glacial-teal water body,
 * aerated cascading foam crests, grazing Fresnel sky sheen, and organic top/
 * side/bottom mist feathering — all in a single pass with zero depth readbacks.
 */
export function createWaterfallMaterial(name, {
  noiseMap,
  waterTint = '#2d5c72',
  foamTint = '#eef6fc',
  speed = 1.75,
} = {}) {
  const uvCoord = uv();
  const across = uvCoord.x;
  const along = uvCoord.y;

  // GPU vertex-stage cascading surface undulation pinned cleanly at the top sluice lip.
  const pinLip = smoothstep(float(0.0), float(0.14), along);
  const acrossEnv = sin(clamp(across, 0, 1).mul(Math.PI));
  const waveA = sin(along.mul(1.85).sub(time.mul(speed * 3.8)).add(across.mul(6.5)));
  const waveB = sin(along.mul(3.4).sub(time.mul(speed * 5.6)).sub(across.mul(11.0))).mul(0.45);
  const surfNorm = normalize(attribute('normal', 'vec3'));
  const displaced = positionLocal.add(surfNorm.mul(waveA.add(waveB).mul(0.24).mul(pinLip).mul(acrossEnv)));

  // Multi-speed animated flow layers.
  const fastSample = texture(noiseMap, vec2(across.mul(2.4), along.mul(0.16).sub(time.mul(speed))));
  const slowSample = texture(noiseMap, vec2(across.mul(1.35).add(0.37), along.mul(0.095).sub(time.mul(speed * 0.54))));
  const fineMist = texture(noiseMap, vec2(across.mul(3.8).sub(0.21), along.mul(0.26).sub(time.mul(speed * 1.32))));

  const streaks = clamp(fastSample.r.mul(0.62).add(slowSample.r.mul(0.38)), 0, 1);
  const turb = clamp(fastSample.g.mul(0.55).add(slowSample.g.mul(0.3)).add(fineMist.g.mul(0.15)), 0, 1);
  const wisp = slowSample.b.mul(0.65).add(fineMist.b.mul(0.35));

  // Organically frayed lateral waterfall edges + frothy plunge acceleration toward the bottom.
  const edge = smoothstep(0.0, 0.22, across).mul(smoothstep(0.78, 1.0, across).oneMinus());
  const frayedEdge = smoothstep(0.06, 0.56, edge.add(wisp.sub(0.5).mul(0.38)));
  const topFeather = smoothstep(0.0, 0.55, along);

  // Aerated whitewater crests along turbulent streaks & accelerated plunge foam.
  const crestFoam = smoothstep(0.36, 0.78, streaks.mul(0.58).add(turb.mul(0.54)));
  const mistSheen = smoothstep(0.52, 0.92, wisp).mul(0.35);
  const foamMask = clamp(crestFoam.add(mistSheen), 0, 1);

  // Deep cold alpine glacial-teal core contrasting cleanly with bright frothy whitewater.
  const deepWater = color(waterTint).mul(mix(float(0.62), float(1.12), streaks));
  const coreColor = mix(deepWater, color(foamTint), foamMask);

  // Grazing Fresnel sky reflection & sparkling water highlight.
  const ndotv = clamp(dot(geometryNormal, viewDirection), 0, 1);
  const fresnel = pow(max(float(1).sub(ndotv), 1e-4), 3.2);
  const skySpec = mix(locationLight.ambientDown, locationLight.ambientUp, float(0.85))
    .mul(fresnel.mul(0.68).add(0.14));

  const ambient = mix(locationLight.ambientDown, locationLight.ambientUp, float(0.75));
  const lighting = max(bakedLight.mul(0.82).add(ambient.mul(0.95)), vec3(0.24, 0.32, 0.40));
  const shaded = coreColor.mul(lighting).add(skySpec).add(color(foamTint).mul(foamMask.mul(0.18)));

  const material = new THREE.MeshBasicNodeMaterial({
    name,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  material.positionNode = displaced;
  material.colorNode = shaded;
  material.opacityNode = clamp(
    frayedEdge.mul(mix(float(0.65), float(1.0), topFeather)).mul(mix(float(0.58), float(0.95), foamMask)),
    0,
    0.95,
  );
  return material;
}
